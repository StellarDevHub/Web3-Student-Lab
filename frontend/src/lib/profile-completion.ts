import { useEffect, useState } from 'react';

const PROFILE_COMPLETION_KEY = 'wallet_profile_completion';
const PROFILE_COMPLETION_EVENT = 'wallet-profile-completion-updated';

type WalletProfileCompletion = Record<string, { email?: string; completedAt: string }>;

function readCompletionMap(): WalletProfileCompletion {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(PROFILE_COMPLETION_KEY);
    return raw ? (JSON.parse(raw) as WalletProfileCompletion) : {};
  } catch {
    return {};
  }
}

function writeCompletionMap(value: WalletProfileCompletion) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(PROFILE_COMPLETION_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(PROFILE_COMPLETION_EVENT));
}

export function markWalletProfileComplete(publicKey: string, email?: string) {
  const current = readCompletionMap();
  current[publicKey] = {
    email,
    completedAt: new Date().toISOString(),
  };
  writeCompletionMap(current);
}

export function hasCompletedProfileForWallet(publicKey: string | null | undefined) {
  if (!publicKey) {
    return false;
  }

  const current = readCompletionMap();
  return !!current[publicKey];
}

export function getCompletedProfileForWallet(publicKey: string | null | undefined) {
  if (!publicKey) {
    return null;
  }

  const current = readCompletionMap();
  return current[publicKey] || null;
}

export function useWalletProfileCompletion(publicKey: string | null | undefined) {
  const [completedProfile, setCompletedProfile] = useState(() =>
    getCompletedProfileForWallet(publicKey)
  );

  useEffect(() => {
    const refresh = () => {
      setCompletedProfile(getCompletedProfileForWallet(publicKey));
    };

    refresh();
    window.addEventListener(PROFILE_COMPLETION_EVENT, refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener(PROFILE_COMPLETION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [publicKey]);

  return completedProfile;
}
