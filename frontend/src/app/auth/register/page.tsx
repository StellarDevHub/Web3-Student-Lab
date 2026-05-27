'use client';

import { useEffect } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { markWalletProfileComplete, useWalletProfileCompletion } from '@/lib/profile-completion';
import { WalletConnectCard } from '@/components/wallet/WalletConnectCard';

export default function RegisterPage() {
  const router = useRouter();
  const { register, error, clearError, user, isLoading, refreshProfileStatus } = useAuth();
  const { publicKey } = useWallet();
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && !user && profileCompleted) {
      router.replace('/auth/login');
    }
  }, [isLoading, profileCompleted, router, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) clearError();
    if (localError) setLocalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalError(null);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setLocalError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      setIsSubmitting(false);
      return;
    }

    try {
      await register(formData.email, formData.password, formData.firstName, formData.lastName);
      if (publicKey) {
        markWalletProfileComplete(publicKey, formData.email);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      if (publicKey && message.toLowerCase().includes('already exists')) {
        markWalletProfileComplete(publicKey, formData.email);
        await refreshProfileStatus();
        router.push('/dashboard');
        return;
      }
      setLocalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] items-center justify-center overflow-hidden bg-black px-4 py-12">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[100px]"></div>

      <div className="relative z-10 w-full max-w-5xl">
        {!publicKey ? (
          <WalletConnectCard
            title="Connect Wallet First"
            description="Before we ask for your learner details, connect the wallet you want tied to your account."
            connectedDescription="Wallet connected. Your learner setup form is now ready below."
          />
        ) : null}

        <div className="mt-6 w-full rounded-2xl border border-white/10 bg-zinc-950 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 -rotate-6 transform items-center justify-center rounded-xl bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-3xl font-black tracking-wide text-white uppercase">
              Complete <span className="text-red-600">Profile</span>
            </h1>
            <p className="font-medium text-gray-400">
              {publicKey
                ? 'Your wallet is connected. Add the remaining learner details to finish setup.'
                : 'Connect your wallet above first, then add the remaining learner details.'}
            </p>
          </div>

          {publicKey && (
            <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Connected wallet
              </p>
              <p className="mt-2 font-mono text-sm break-all text-white">{publicKey}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={`space-y-5 ${!publicKey ? 'opacity-60' : ''}`}>
            {(error || localError) && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <p className="text-center text-sm font-bold text-red-500">{error || localError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
                >
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  disabled={!publicKey || isSubmitting}
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white placeholder-gray-600 transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
                >
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  disabled={!publicKey || isSubmitting}
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white placeholder-gray-600 transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
              >
                Network ID (Email)
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                disabled={!publicKey || isSubmitting}
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white placeholder-gray-600 transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="student@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
              >
                Passphrase
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                disabled={!publicKey || isSubmitting}
                value={formData.password}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white placeholder-gray-600 transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-xs font-bold tracking-wider text-gray-400 uppercase"
              >
                Confirm Passphrase
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                disabled={!publicKey || isSubmitting}
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white placeholder-gray-600 transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={!publicKey || isSubmitting}
              className={`mt-2 w-full rounded-lg py-4 font-black tracking-widest uppercase shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all ${
                !publicKey || isSubmitting
                  ? 'cursor-not-allowed bg-red-900 text-gray-400'
                  : 'transform bg-red-600 text-white hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-[0_0_25px_rgba(220,38,38,0.6)]'
              }`}
            >
              {!publicKey
                ? 'Connect wallet to continue'
                : isSubmitting
                  ? 'Saving details...'
                  : 'Finish setup'}
            </button>
          </form>

          <div className="mt-8 border-t border-white/10 pt-6 text-center">
            <p className="text-gray-400">
              Already connected and set up?{' '}
              <Link
                href="/auth/login"
                className="font-bold tracking-wide text-red-500 uppercase hover:text-red-400"
              >
                Open wallet access
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
