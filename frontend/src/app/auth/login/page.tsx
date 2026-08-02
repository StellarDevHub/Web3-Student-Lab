'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { WalletConnectCard } from '@/components/wallet/WalletConnectCard';
import { useWalletProfileCompletion } from '@/lib/profile-completion';
import { useEffect } from 'react';
import { getWorkspaceId } from '@/lib/api-config';

const GITHUB_OAUTH_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/oauth/github`;

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { publicKey } = useWallet();
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [router, isAuthenticated]);

  const handleGitHubLogin = () => {
    const workspaceId = getWorkspaceId();
    window.location.href = `${GITHUB_OAUTH_URL}?workspaceId=${workspaceId}`;
  };

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] justify-center bg-black px-4 py-12">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[100px]"></div>

      <div className="relative z-10 w-full max-w-3xl">
        <WalletConnectCard
          title="Connect Your Wallet"
          description="Wallet connection is now the first step. Once your wallet is connected, we can collect any remaining learner details."
          connectedDescription="Your wallet is connected. Continue to complete your learner profile and unlock the rest of the platform."
        />

        {/* GitHub OAuth Login Option */}
        <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 px-6 py-5 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-sm font-semibold text-white">
              Sign in with GitHub
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Use your GitHub account to quickly sign in or create a new account.
            </p>
          </div>
          <button
            onClick={handleGitHubLogin}
            className="inline-flex items-center gap-2 rounded-xl bg-[#24292e] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1b1f23]"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        {/* Separator */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1 border-t border-white/10" />
          <span className="text-xs text-gray-500">OR</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 px-6 py-5 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-sm font-semibold text-white">
              {publicKey
                ? profileCompleted
                  ? 'Wallet connected. Open your account access.'
                  : 'Wallet connected. Continue with your details.'
                : 'Need to finish setup?'}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {profileCompleted
                ? 'Your profile looks completed for this wallet.'
                : 'We ask for profile details only after the wallet step.'}
            </p>
          </div>
          <Link
            href={profileCompleted ? '/dashboard' : '/auth/register'}
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-red-700"
          >
            {publicKey ? (profileCompleted ? 'Open dashboard' : 'Continue setup') : 'Open setup'}
          </Link>
        </div>
      </div>
    </div>
  );
}

