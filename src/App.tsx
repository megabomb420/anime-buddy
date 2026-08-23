import { Route, Routes } from "react-router";
import { BottomNav } from "@/components/BottomNav";
import BuddyPage from "@/pages/BuddyPage";
import DiscoverPage from "@/pages/DiscoverPage";
import HomePage from "@/pages/HomePage";
import LibraryPage from "@/pages/LibraryPage";
import ProfilePage from "@/pages/ProfilePage";
import AnimeDetailPage from "@/pages/AnimeDetailPage";
import CharactersPage from "@/pages/CharactersPage";
import CharacterDetailPage from "@/pages/CharacterDetailPage";

/**
 * App shell — mobile-first, dark-first. Five top-level destinations with
 * bottom navigation. Feature screens (anime detail, character detail,
 * Tonight, Anime Lens, …) mount under these routes as they're implemented.
 */
export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/buddy" element={<BuddyPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/anime/:anilistId" element={<AnimeDetailPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/character/:characterId" element={<CharacterDetailPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
