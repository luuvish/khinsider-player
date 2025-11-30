import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Navbar } from '@/components/layout/Navbar';
import { Player } from '@/components/player';
import { Container } from '@/components/ui';
import { HomePage } from '@/pages/HomePage';
import { YearPage } from '@/pages/YearPage';
import { AlbumPage } from '@/pages/AlbumPage';
import { SearchPage } from '@/pages/SearchPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { LoginPage } from '@/pages/LoginPage';
import { useAuthStore } from '@/stores/authStore';

function AppContent() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Navbar />
      <main className="pb-28">
        {/* pb-28 for player height offset (h-20 desktop + extra padding) */}
        <Container>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/year/:year" element={<YearPage />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Container>
      </main>
      <Player />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
