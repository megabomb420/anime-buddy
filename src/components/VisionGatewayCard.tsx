import { useEffect, useState } from "react";
import { Check, Cloud, ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStoredWorkerUrl,
  getWorkerUrl,
  probeWorker,
  setStoredWorkerUrl,
  type WorkerHealth,
} from "@/lib/worker-gateway";
import { cn } from "@/lib/utils";

const CF_WORKERS = "https://dash.cloudflare.com/?to=/:account/workers-and-pages";
const CF_DEPLOY =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker";
const DEEPSEEK_KEYS = "https://platform.deepseek.com/api_keys";
const EXAMPLE_URL = "https://anime-buddy-worker.yourname.workers.dev";

function statusCopy(health: WorkerHealth | null, hasUrl: boolean): { label: string; tone: "idle" | "warn" | "ok" } {
  if (!hasUrl || !health) return { label: "Not connected", tone: "idle" };
  if (!health.ok) return { label: "Unreachable", tone: "warn" };
  if (!health.vision) return { label: "Worker up · key missing", tone: "warn" };
  return { label: "Vision ready", tone: "ok" };
}

export function VisionGatewayCard() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<WorkerHealth | null>(null);

  useEffect(() => {
    const existing = getStoredWorkerUrl() || getWorkerUrl();
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
    setUrl(cleaned);
    await check(cleaned);
  }

  function disconnect() {
    setStoredWorkerUrl("");
    setUrl("");
    setHealth(null);
  }

  const hasUrl = Boolean(url.trim() || getWorkerUrl());
  const status = statusCopy(health, hasUrl);

  return (
    <section id="vision" className="scroll-mt-24 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Cloud className="size-4" />
          Scan vision
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
          Photos go to your Cloudflare Worker. The DeepSeek key stays there as a secret — never in this
          app.
        </p>

        <div className="space-y-2">
          <Label htmlFor="worker-url">Paste the Worker address</Label>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Not the DeepSeek key. In Cloudflare, open your Worker. At the top of that page is a website
            address ending in <span className="text-foreground">workers.dev</span> — copy the whole thing.
          </p>
          <div className="rounded-lg bg-background px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Looks like this</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{EXAMPLE_URL}</p>
          </div>
          <Input
            id="worker-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={EXAMPLE_URL}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className="h-11 rounded-full" disabled={busy} onClick={() => void save()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save & check
          </Button>
          <Button variant="secondary" className="h-11 rounded-full" disabled={busy} onClick={() => void check()}>
            Test only
          </Button>
          {getStoredWorkerUrl() ? (
            <Button variant="ghost" className="h-11 rounded-full" onClick={disconnect}>
              Disconnect
            </Button>
          ) : null}
        </div>

        {health && (
          <p className={cn("text-sm", health.ok && health.vision ? "text-foreground" : "text-muted-foreground")}>
            {!health.ok && (health.error ?? "Worker not reachable.")}
            {health.ok && !health.vision && (
              <>
                Worker is up, but vision is off. Add the{" "}
                <span className="text-foreground">DEEPSEEK_API_KEY</span> secret, then check again.
              </>
            )}
            {health.ok && health.vision && "Connected. Scan can identify figurines against the catalog."}
          </p>
        )}

        <details className="rounded-xl border border-border bg-background p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Need to create the Worker first?</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              Get a DeepSeek key at{" "}
              <a
                href={DEEPSEEK_KEYS}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                platform.deepseek.com
              </a>
              .
            </li>
            <li>
              Log into{" "}
              <a
                href={CF_WORKERS}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Cloudflare Workers
              </a>
              . Create an application and connect GitHub repo{" "}
              <span className="text-foreground">megabomb420/anime-buddy</span>, with root directory{" "}
              <span className="text-foreground">worker</span>.
            </li>
            <li>
              After it deploys: <span className="text-foreground">Settings → Variables and Secrets → Add</span>.
              Type <span className="text-foreground">Secret</span>, name{" "}
              <span className="text-foreground">DEEPSEEK_API_KEY</span>, paste the key.
            </li>
            <li>Copy the address from the top of the Worker page and paste it above.</li>
          </ol>
          <a
            href={CF_DEPLOY}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-secondary px-4 text-sm text-secondary-foreground"
          >
            Deploy Worker on Cloudflare
            <ExternalLink className="ml-2 size-3.5" />
          </a>
        </details>
      </div>
    </section>
  );
}
