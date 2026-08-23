import { useEffect, useState } from "react";
import { Check, Cloud, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_WORKER_URL,
  getStoredWorkerUrl,
  getWorkerUrl,
  probeWorker,
  setStoredWorkerUrl,
  type WorkerHealth,
} from "@/lib/worker-gateway";
import { cn } from "@/lib/utils";

function statusCopy(health: WorkerHealth | null, hasUrl: boolean): { label: string; tone: "idle" | "warn" | "ok" } {
  if (!hasUrl || !health) return { label: "Checking…", tone: "idle" };
  if (!health.ok) return { label: "Unreachable", tone: "warn" };
  if (!health.vision) return { label: "Worker up · key missing", tone: "warn" };
  return { label: "Vision ready", tone: "ok" };
}

export function VisionGatewayCard() {
  const [url, setUrl] = useState(DEFAULT_WORKER_URL);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<WorkerHealth | null>(null);

  useEffect(() => {
    const existing = getWorkerUrl();
    setUrl(existing);
    if (existing) void probeWorker(existing).then(setHealth);
  }, []);

  async function check(next = url) {
    setBusy(true);
    const result = await probeWorker(next);
    setHealth(result);
    setBusy(false);
    return result;
  }

  async function save() {
    const cleaned = setStoredWorkerUrl(url);
    setUrl(cleaned || DEFAULT_WORKER_URL);
    await check(cleaned || DEFAULT_WORKER_URL);
  }

  function resetBuiltIn() {
    setStoredWorkerUrl("");
    setUrl(DEFAULT_WORKER_URL);
    void check(DEFAULT_WORKER_URL);
  }

  const hasUrl = Boolean(getWorkerUrl());
  const status = statusCopy(health, hasUrl);
  const usingOverride = Boolean(getStoredWorkerUrl()) && getStoredWorkerUrl() !== DEFAULT_WORKER_URL;

  return (
    <section id="vision" className="scroll-mt-24 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Cloud className="size-4" />
          Scan + Buddy
        </h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs",
            status.tone === "ok" && "bg-foreground text-background",
            status.tone === "warn" && "bg-destructive/15 text-destructive",
            status.tone === "idle" && "bg-secondary text-muted-foreground",
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Live Scan and Buddy already use the Cloudflare Worker. The DeepSeek key stays there — never in
          this app.
        </p>

        <p className="break-all font-mono text-xs text-foreground">{getWorkerUrl()}</p>

        {health && (
          <p className={cn("text-sm", health.ok && health.vision ? "text-foreground" : "text-muted-foreground")}>
            {!health.ok && (health.error ?? "Worker not reachable.")}
            {health.ok && !health.vision && (
              <>
                Worker is up, but vision is off. Add the{" "}
                <span className="text-foreground">DEEPSEEK_API_KEY</span> secret, then check again.
              </>
            )}
            {health.ok && health.vision && "Connected. Scan identifies figurines. Buddy chats on the same Worker."}
          </p>
        )}

        <details className="rounded-xl border border-border bg-background p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Use a different Worker</summary>
          <div className="mt-3 space-y-3">
            <Label htmlFor="worker-url">Worker address</Label>
            <Input
              id="worker-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_WORKER_URL}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-11 rounded-xl"
            />
            <div className="flex flex-wrap gap-2">
              <Button className="h-11 rounded-full" disabled={busy} onClick={() => void save()}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save & check
              </Button>
              <Button variant="secondary" className="h-11 rounded-full" disabled={busy} onClick={() => void check()}>
                Test only
              </Button>
              {usingOverride ? (
                <Button variant="ghost" className="h-11 rounded-full" onClick={resetBuiltIn}>
                  Reset to built-in
                </Button>
              ) : null}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
