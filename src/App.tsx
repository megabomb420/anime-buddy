import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router";
import { BottomNav } from "@/components/BottomNav";
import { Toaster } from "@/components/ui/sonner";
import DiscoverPage from "@/pages/DiscoverPage";
import HomePage from "@/pages/HomePage";

const BuddyPage = lazy(() => import("@/pages/BuddyPage"));
const LibraryPage = lazy(() => import("@/pages/LibraryPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const AnimeDetailPage = lazy(() => import("@/pages/AnimeDetailPage"));
const CharactersPage = lazy(() => import("@/pages/CharactersPage"));
const CharacterDetailPage = lazy(() => import("@/pages/CharacterDetailPage"));
const ScanPage = lazy(() => import("@/pages/ScanPage"));

export default function App() {
  const { pathname } = useLocation();
  const scan = pathname === "/scan";
  const buddy = pathname === "/buddy";
  const edgeToEdge = pathname === "/" || pathname === "/discover";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {scan ? (
        <Suspense fallback={null}>
          <Routes>
            <Route path="/scan" element={<ScanPage />} />
          </Routes>
        </Suspense>
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
            <Suspense fallback={null}>
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
            </Suspense>
          </main>
          <BottomNav />
        </>
      )}
    </div>
  );
}
