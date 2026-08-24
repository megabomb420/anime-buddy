import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_VERSION, checkForUpdate, type VersionCheck } from "@/lib/app-version";

/** Quiet version + update strip for the bottom of Home. */
export function AppVersionFooter() {
  const [check, setCheck] = useState<VersionCheck>({ status: "loading" });

  useEffect(() => {
    void checkForUpdate().then(setCheck);
  }, []);

  return (
    <div className="border-t border-border/70 pt-5 text-center">
      <p className="text-xs text-muted-foreground">v{APP_VERSION}</p>
      {check.status === "latest" && (
        <p className="mt-1 text-[11px] text-muted-foreground">You're on the latest build.</p>
      )}
      {check.status === "update" && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Update available · v{check.latest.version}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={() => window.location.reload()}
          >
            Update
          </Button>
        </div>
      )}
    </div>
  );
}
