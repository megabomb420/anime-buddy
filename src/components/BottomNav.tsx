import { Compass, Home, Library, MessageCircle, User } from "lucide-react";
import { NavLink } from "react-router";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/buddy", label: "Buddy", icon: MessageCircle },
  { to: "/library", label: "Library", icon: Library },
  { to: "/profile", label: "Profile", icon: User },
];

/** Mobile bottom navigation: Home / Discover / Buddy / Library / Profile. */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-between">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
