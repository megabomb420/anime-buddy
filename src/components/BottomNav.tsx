import { Camera, Compass, Home, Library, MessageCircle } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/scan", label: "Scan", icon: Camera, scan: true },
  { to: "/library", label: "Library", icon: Library },
  { to: "/buddy", label: "Buddy", icon: MessageCircle },
] as const;

/** Mobile bottom navigation with a center Scan action. */
export function BottomNav() {
  const { pathname } = useLocation();
  if (pathname === "/scan" || pathname.startsWith("/anime/") || pathname.startsWith("/character/")) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-1">
        {items.map((item) => {
          const Icon = item.icon;
          if ("scan" in item && item.scan) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label="Scan"
                className="-mt-5 flex min-h-12 flex-1 flex-col items-center justify-end gap-0.5 pb-1.5 text-[10px]"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Camera className="size-6" strokeWidth={1.8} />
                </span>
                Scan
              </NavLink>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item && item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
