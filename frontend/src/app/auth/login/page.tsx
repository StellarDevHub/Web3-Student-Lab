'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { WalletConnectCard } from '@/components/wallet/WalletConnectCard';
import { useWalletProfileCompletion } from '@/lib/profile-completion';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { publicKey } = useWallet();
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [router, user]);

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] items-center justify-center overflow-hidden bg-black px-4 py-12">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[100px]"></div>

      <div className="relative z-10 w-full max-w-3xl">
        <WalletConnectCard
          title="Connect Your Wallet"
          description="Wallet connection is now the first step. Once your wallet is connected, we can collect any remaining learner details."
          connectedDescription="Your wallet is connected. Continue to complete your learner profile and unlock the rest of the platform."
        />

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
