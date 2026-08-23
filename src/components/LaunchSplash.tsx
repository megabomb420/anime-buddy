import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "ab-splash-v1";
const HOLD_MS = 2000;
const FADE_MS = 700;

function asset(name: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${name}`.replace(/([^:]\/)\/+/g, "$1");
}

export function LaunchSplash() {
  const [phase, setPhase] = useState<"off" | "show" | "out">("off");

  useLayoutEffect(() => {
    const boot = document.getElementById("boot-splash");
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      seen = false;
    }

    if (seen) {
      boot?.remove();
      return;
    }

    if (boot) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const hold = reduced ? 240 : HOLD_MS;
      const t = window.setTimeout(() => {
        boot.classList.add("is-out");
        try {
          sessionStorage.setItem(KEY, "1");
        } catch {
          /* ignore */
        }
        window.setTimeout(() => boot.remove(), FADE_MS);
      }, hold);
      return () => window.clearTimeout(t);
    }

    setPhase("show");
  }, []);

  useEffect(() => {
    if (phase !== "show") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 240 : HOLD_MS;
    const t = window.setTimeout(() => {
      setPhase("out");
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }, hold);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = window.setTimeout(() => setPhase("off"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "off") return null;

  return (
    <div
      className={cn("splash-root", phase === "out" && "splash-out")}
      role="dialog"
      aria-label="Anime Buddy"
      aria-live="polite"
    >
      <div className="hero-art">
        <img src={asset("splash.jpg")} alt="" className="h-full w-full object-cover object-top" />
      </div>
      <div className="hero-grain absolute inset-0" />
      <div className="splash-veil" />
      <div className="splash-copy">
        <img src={asset("splash-mark.jpg")} alt="" className="splash-mark" />
        <p className="splash-kicker">Your watch companion</p>
        <h1 className="splash-title">Anime Buddy</h1>
        <span className="splash-line" />
      </div>
    </div>
  );
}
