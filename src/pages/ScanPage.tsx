import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Camera, ImagePlus, RefreshCcw, SwitchCamera, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgeBadge } from "@/components/AgeBadge";
import {
  analyzeCapture,
  type CatalogMatch,
  type ScanConfidenceBand,
  type ScanOutcome,
} from "@/lib/services/VisionService";
import { persistence } from "@/lib/db/persistence";
import { blobToObjectUrl } from "@/lib/image/compress";
import { getWorkerUrl } from "@/lib/worker-gateway";
import { cn } from "@/lib/utils";
import type { AnimeSummary } from "@/types/anime";

type Phase =
  | "intro"
  | "requesting"
  | "live"
  | "denied"
  | "unavailable"
  | "analyzing"
  | "results"
  | "error";

function titleOf(anime: AnimeSummary) {
  return anime.title.english || anime.title.romaji || `Anime #${anime.anilistId}`;
}

function bandCopy(band: ScanConfidenceBand, detected: boolean): { title: string; body: string } {
  if (!detected && band === "none") {
    return {
      title: "Nothing recognizable",
      body: "I couldn't see a figurine, print, or character in that frame.",
    };
  }
  if (band === "high") return { title: "Looks like a match", body: "High confidence — confirm it's the right title." };
  if (band === "likely") return { title: "Likely match", body: "Pretty sure, but pick the right one if this isn't it." };
  if (band === "ambiguous") {
    return { title: "A few possibilities", body: "I'm not certain. Choose the title that fits, or retake." };
  }
  return { title: "Couldn't resolve", body: "Recognition ran, but nothing in the catalog lined up cleanly." };
}

function MatchCard({ match, featured, onAdd }: { match: CatalogMatch; featured?: boolean; onAdd: (id: number) => void }) {
  const anime = match.anime;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", featured && "ring-1 ring-foreground/20")}>
      <div className="flex gap-3 p-3">
        <div className="h-28 w-[78px] shrink-0 overflow-hidden rounded-lg bg-muted">
          {anime.coverImage ? <img src={anime.coverImage} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{titleOf(anime)}</p>
          {match.character && <p className="mt-0.5 truncate text-xs text-muted-foreground">{match.character.name}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {anime.seasonYear ? <span>{anime.seasonYear}</span> : null}
            <AgeBadge guide={anime.ageGuide} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" className="h-8 rounded-full">
              <Link to={`/anime/${anime.anilistId}`}>Open anime</Link>
            </Button>
            {match.character && (
              <Button asChild size="sm" variant="secondary" className="h-8 rounded-full">
                <Link to={`/character/${match.character.id}`}>Character</Link>
              </Button>
            )}
            <Button size="sm" variant="secondary" className="h-8 rounded-full" onClick={() => onAdd(anime.anilistId)}>
              <Plus className="size-3.5" />
              Plan to watch
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const identifyGen = useRef(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera(nextFacing: "environment" | "user" = facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unavailable");
      setErrorDetail("This browser cannot access a camera. You can still pick a photo.");
      return;
    }
    setPhase("requesting");
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setFacing(nextFacing);
      setPhase("live");
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPhase("denied");
        setErrorDetail("Camera permission was denied. Enable it in the browser site settings, then retry.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPhase("unavailable");
        setErrorDetail("No usable camera was found. You can still pick a photo.");
      } else {
        setPhase("unavailable");
        setErrorDetail("Couldn't start the camera. You can still pick a photo from the library.");
      }
    }
  }

  async function identifyBlob(shot: Blob) {
    const gen = ++identifyGen.current;
    setPhase("analyzing");
    setOutcome(null);
    if (!navigator.onLine) {
      setPhase("error");
      setErrorDetail("You're offline. Connect and try again.");
      return;
    }
    try {
      const result = await analyzeCapture(shot);
      if (gen !== identifyGen.current) return;
      setOutcome(result);
      setPhase("results");
    } catch {
      if (gen !== identifyGen.current) return;
      setPhase("error");
      setErrorDetail("Something went wrong while identifying that photo.");
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 8) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const shot = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!shot) return;
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(shot);
    setPreviewUrl(blobToObjectUrl(shot));
    void identifyBlob(shot);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(file);
    setPreviewUrl(blobToObjectUrl(file));
    void identifyBlob(file);
  }

  function retake() {
    identifyGen.current += 1;
    setOutcome(null);
    setBlob(null);
    setErrorDetail(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    void startCamera(facing);
  }

  async function addToLibrary(id: number) {
    await persistence.setLibraryStatus(id, "plan_to_watch");
  }

  const showViewfinder = phase === "live" || phase === "requesting";
  const showStill = (phase === "analyzing" || phase === "results" || phase === "error") && previewUrl;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {showViewfinder && (
        <video
          ref={videoRef}
          className={cn("absolute inset-0 h-full w-full object-cover", facing === "user" && "-scale-x-100")}
          autoPlay
          playsInline
          muted
        />
      )}
      {showStill && <img src={previewUrl} alt="Captured frame" className="absolute inset-0 h-full w-full object-cover" />}

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/70" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="secondary" size="icon" className="size-10 rounded-full" onClick={() => navigate("/")} aria-label="Close scan">
          <X className="size-5" />
        </Button>
        <p className="text-lg font-semibold tracking-tight">Scan</p>
        <Button
          variant="secondary"
          size="icon"
          className="size-10 rounded-full"
          onClick={() => void startCamera(facing === "environment" ? "user" : "environment")}
          aria-label="Switch camera"
          disabled={phase !== "live"}
        >
          <SwitchCamera className="size-5" />
        </Button>
      </header>

      {phase === "intro" && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md space-y-4 pb-6 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Camera className="size-7" />
            </div>
            <h1 className="text-3xl font-semibold">Point at a figure</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Scan a figurine, print, or piece of merch. I'll guess the character, then match a real title from the catalog — never invent one.
            </p>
            {!getWorkerUrl() && (
              <p className="text-sm text-muted-foreground">
                Identification needs your Cloudflare Worker.{" "}
                <Link to="/profile#vision" className="underline underline-offset-2">
                  Connect vision
                </Link>
              </p>
            )}
            <Button className="h-12 w-full rounded-full" onClick={() => void startCamera()}>
              Open camera
            </Button>
            <Button variant="secondary" className="h-12 w-full rounded-full" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" />
              Use a photo
            </Button>
          </div>
        </div>
      )}

      {phase === "requesting" && (
        <p className="absolute inset-x-0 bottom-24 z-20 text-center text-sm text-muted-foreground">Waiting for camera…</p>
      )}

      {phase === "live" && (
        <>
          <div className="pointer-events-none absolute inset-x-[12%] top-[18%] bottom-[28%]">
            <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-2 border-t-2 border-foreground/80" />
            <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-2 border-t-2 border-foreground/80" />
            <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-2 border-l-2 border-foreground/80" />
            <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-2 border-r-2 border-foreground/80" />
          </div>
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fill the frame · keep it steady</p>
            <div className="flex items-center gap-8">
              <Button variant="secondary" size="icon" className="size-12 rounded-full" onClick={() => fileRef.current?.click()} aria-label="Pick a photo">
                <ImagePlus className="size-5" />
              </Button>
              <button type="button" onClick={() => void captureFrame()} className="size-[72px] rounded-full border-4 border-foreground bg-foreground/20" aria-label="Capture" />
              <div className="size-12" />
            </div>
          </div>
        </>
      )}

      {(phase === "denied" || phase === "unavailable" || (phase === "error" && !blob)) && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-semibold">{phase === "denied" ? "Camera blocked" : phase === "unavailable" ? "No camera" : "Scan failed"}</h2>
            <p className="text-sm text-muted-foreground">{errorDetail}</p>
            <div className="flex flex-col gap-2">
              {phase !== "unavailable" && (
                <Button className="h-11 rounded-full" onClick={() => void startCamera()}>Try camera again</Button>
              )}
              <Button variant="secondary" className="h-11 rounded-full" onClick={() => fileRef.current?.click()}>Use a photo instead</Button>
            </div>
          </div>
        </div>
      )}

      {phase === "analyzing" && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-2xl font-semibold">Looking closely…</p>
          <p className="mt-1 text-sm text-muted-foreground">Vision first, then the real catalog.</p>
          <Button variant="secondary" className="mt-4 h-10 rounded-full" onClick={retake}>
            <RefreshCcw className="size-4" />
            Cancel
          </Button>
        </div>
      )}

      {phase === "error" && blob && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-semibold">Scan failed</h2>
            <p className="text-sm text-muted-foreground">{errorDetail}</p>
            <div className="flex flex-col gap-2">
              <Button className="h-11 rounded-full" onClick={() => blob && void identifyBlob(blob)}>Try again</Button>
              <Button variant="secondary" className="h-11 rounded-full" onClick={retake}>Retake</Button>
            </div>
          </div>
        </div>
      )}

      {phase === "results" && outcome && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-foreground/20" />
            <div className="flex gap-3">
              {previewUrl && (
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg">
                  <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {outcome.recognition.objectType?.replace("_", " ") ?? "scan"}
                  {outcome.recognition.confidence !== undefined ? ` · ${Math.round(outcome.recognition.confidence * 100)}%` : ""}
                </p>
                <h2 className="text-2xl font-semibold leading-tight">
                  {outcome.gatewayError === "not_configured"
                    ? "Vision isn't configured"
                    : outcome.gatewayError === "timeout"
                      ? "Vision timed out"
                      : outcome.gatewayError
                        ? "Couldn't identify"
                        : bandCopy(outcome.band, outcome.recognition.detected).title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {outcome.gatewayMessage ?? bandCopy(outcome.band, outcome.recognition.detected).body}
                </p>
              </div>
            </div>

            {outcome.matches.length > 0 && (
              <div className="space-y-2">
                {outcome.matches.map((m, i) => (
                  <MatchCard key={m.anime.anilistId} match={m} featured={i === 0} onAdd={addToLibrary} />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              {outcome.gatewayError === "not_configured" && (
                <Button asChild className="h-11 rounded-full">
                  <Link to="/profile#vision">Connect vision</Link>
                </Button>
              )}
              <Button variant="secondary" className="h-11 flex-1 rounded-full" onClick={retake}>Try again</Button>
              <Button asChild variant="secondary" className="h-11 flex-1 rounded-full">
                <Link to="/discover">Search catalog</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
