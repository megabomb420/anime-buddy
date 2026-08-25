import { Route, Routes, useLocation } from "react-router";
import { BottomNav } from "@/components/BottomNav";
import { Toaster } from "@/components/ui/sonner";
import BuddyPage from "@/pages/BuddyPage";
import DiscoverPage from "@/pages/DiscoverPage";
import HomePage from "@/pages/HomePage";
import LibraryPage from "@/pages/LibraryPage";
import ProfilePage from "@/pages/ProfilePage";
import AnimeDetailPage from "@/pages/AnimeDetailPage";
import CharactersPage from "@/pages/CharactersPage";
import CharacterDetailPage from "@/pages/CharacterDetailPage";
import ScanPage from "@/pages/ScanPage";

export default function App() {
  const { pathname } = useLocation();
  const scan = pathname === "/scan";
  const buddy = pathname === "/buddy";
  const edgeToEdge = pathname === "/" || pathname === "/discover";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {scan ? (
        <Routes>
          <Route path="/scan" element={<ScanPage />} />
        </Routes>
      ) : (
        <>
          <Toaster position="top-center" />
          <main
            className={
              buddy
                ? ""
                : edgeToEdge
                  ? "pb-[calc(6rem+env(safe-area-inset-bottom))]"
                  : "mx-auto max-w-md px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.5rem))]"
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/buddy" element={<BuddyPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/anime/:anilistId" element={<AnimeDetailPage />} />
              <Route path="/characters" element={<CharactersPage />} />
              <Route path="/character/:characterId" element={<CharacterDetailPage />} />
              <Route path="/scan" element={<ScanPage />} />
            </Routes>
          </main>
          <BottomNav />
        </>
      )}
    </div>
  );
}
