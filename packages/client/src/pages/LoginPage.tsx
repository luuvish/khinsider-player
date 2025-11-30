import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Input, Button } from '@/components/ui';
import { User, Lock, AlertCircle, Music2 } from '@/lib/icons';

const PASSWORD_PATTERN = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?]).{12,}$";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (isRegister && password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      navigate('/');
    } catch {
      // Error is handled by the store
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setLocalError(null);
    clearError();
  };

  const displayError = error || localError;

  return (
    <div className="min-h-[calc(100vh-theme(spacing.20))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 rounded-2xl bg-accent-500/10 mb-4">
            <Music2 className="w-10 h-10 text-accent-400" />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-100">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            {isRegister
              ? 'Sign up to save your favorites'
              : 'Sign in to continue to your music'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Username
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                icon={User}
                required
                minLength={3}
                maxLength={50}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                icon={Lock}
                required
                minLength={12}
                pattern={PASSWORD_PATTERN}
                title="Password must be at least 12 characters with uppercase, lowercase, number, and special character"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              {isRegister && (
                <p className="text-xs text-neutral-500 mt-2">
                  Min 12 characters with uppercase, lowercase, number, and special character
                </p>
              )}
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  icon={Lock}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
            )}

            {displayError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20">
                <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
                <p className="text-sm text-error">{displayError}</p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={isLoading}
              className="w-full"
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          {/* Toggle Auth Mode */}
          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-400">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-accent-400 hover:text-accent-300 font-medium transition-colors"
              >
                {isRegister ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>

        {/* Guest Link */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Continue as guest
          </Link>
        </div>
      </div>
    </div>
  );
}
