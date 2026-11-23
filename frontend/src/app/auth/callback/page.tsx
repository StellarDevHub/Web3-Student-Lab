'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI } from '@/lib/api';

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Completing GitHub login...');

  useEffect(() => {
    const error = searchParams.get('error');
    const ticket = searchParams.get('ticket');

    // Clean up legacy refreshToken from localStorage
    localStorage.removeItem('refreshToken');

    if (error) {
      setStatus('error');
      setMessage(error);
      return;
    }

    if (!ticket) {
      setStatus('error');
      setMessage('Invalid OAuth response. Please try again.');
      return;
    }

    let active = true;
    authAPI.completeOAuthTicket(ticket).then((response) => {
      if (!active) return;
      localStorage.setItem('token', response.accessToken || response.token);
      localStorage.setItem('userId', response.user.id);
      localStorage.setItem('userName', response.user.name);
      localStorage.setItem('user', JSON.stringify(response.user));
      setStatus('success');
      setMessage('Login successful! Redirecting...');
      window.setTimeout(() => {
        router.replace(response.isNewUser ? '/auth/register?from=github' : '/dashboard');
      }, 1000);
    }).catch(() => {
      if (!active) return;
      setStatus('error');
      setMessage('The login ticket is invalid or expired. Please try again.');
    });

    return () => { active = false; };
  }, [searchParams, router]);

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/80 p-8 text-center">
        {status === 'processing' && (
          <>
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            <h2 className="text-xl font-semibold text-white">Completing Login</h2>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Login Successful!</h2>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Login Failed</h2>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
            <button
              onClick={() => router.replace('/auth/login')}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
        </div>
      }
    >
      <GitHubCallbackContent />
    </Suspense>
  );
}
