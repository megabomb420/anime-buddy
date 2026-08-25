/**
 * Undo toast — every library / rating / progress write offers a 6s way back.
 *
 * Uses sonner (Toaster is mounted once in App.tsx). The undo callback must
 * restore the exact pre-write state captured by the caller.
 */
import { toast } from "sonner";

export function undoToast(message: string, onUndo: () => void | Promise<void>): void {
  toast(message, {
    duration: 6000,
    action: {
      label: "Undo",
      onClick: () => void onUndo(),
    },
  });
}
