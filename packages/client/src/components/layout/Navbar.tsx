import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';
import { Container } from '@/components/ui';
import { Menu, X, Home, Search, Heart, User, LogOut } from '@/lib/icons';
import { logger } from '@/utils/logger';

const navLinks = [
  { to: '/', label: 'Browse', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/favorites', label: 'Favorites', icon: Heart },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      logger.error('Logout failed:', err instanceof Error ? err.message : err);
    } finally {
      navigate('/login');
      setIsMobileMenuOpen(false);
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-neutral-950/80 border-b border-neutral-800/50">
        <Container>
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight text-neutral-100 hover:text-accent-400 transition-colors"
            >
              Khinsider
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-neutral-800 text-neutral-100'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50'
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop User Area */}
            <div className="hidden sm:flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-neutral-400">
                    {user?.username}
                  </span>
                  <button
                    onClick={handleLogout}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                      'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors'
                    )}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-accent-600 text-white hover:bg-accent-500 transition-colors'
                  )}
                >
                  <User className="h-4 w-4" />
                  Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="sm:hidden p-2 -mr-2 text-neutral-400 hover:text-neutral-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </Container>
      </nav>

      {/* Mobile Menu */}
      <Transition show={isMobileMenuOpen}>
        <Dialog onClose={closeMobileMenu} className="relative z-50 sm:hidden">
          {/* Backdrop */}
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </TransitionChild>

          {/* Panel */}
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="fixed inset-y-0 right-0 w-full max-w-xs bg-neutral-900 shadow-xl">
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between px-4 h-14 border-b border-neutral-800">
                  <span className="text-lg font-semibold text-neutral-100">Menu</span>
                  <button
                    onClick={closeMobileMenu}
                    className="p-2 -mr-2 text-neutral-400 hover:text-neutral-100"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-2 py-4 space-y-1">
                  {navLinks.map((link) => {
                    const isActive = location.pathname === link.to;
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={closeMobileMenu}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors',
                          isActive
                            ? 'bg-neutral-800 text-neutral-100'
                            : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>

                {/* User Area */}
                <div className="px-4 py-4 border-t border-neutral-800">
                  {isAuthenticated ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 px-2">
                        <div className="h-10 w-10 rounded-full bg-neutral-800 flex items-center justify-center">
                          <User className="h-5 w-5 text-neutral-400" />
                        </div>
                        <span className="text-sm font-medium text-neutral-100">
                          {user?.username}
                        </span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
                      >
                        <LogOut className="h-5 w-5" />
                        Logout
                      </button>
                    </div>
                  ) : (
                    <Link
                      to="/login"
                      onClick={closeMobileMenu}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-500 transition-colors"
                    >
                      <User className="h-5 w-5" />
                      Login
                    </Link>
                  )}
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  );
}
