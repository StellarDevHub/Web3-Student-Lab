'use client';

import { CollaborativeCanvas } from '@/components/CollaborativeCanvas';
import { EncryptedRoomChat } from '@/components/collaboration/EncryptedRoomChat';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Suspense } from 'react';

function BrainstormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [roomId, setRoomId] = useState<string>('');
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const generateRoomId = (): string => {
    return `canvas-${Math.random().toString(36).substring(2, 11)}`;
  };

  useEffect(() => {
    if (!searchParams) return;
    const sessionId = searchParams.get('session') || generateRoomId();
    setRoomId(sessionId);

    const savedName = localStorage.getItem(`canvas-${sessionId}-name`);
    if (savedName) {
      setSessionName(savedName);
    } else {
      const newName = `Canvas ${new Date().toLocaleDateString()}`;
      setSessionName(newName);
      localStorage.setItem(`canvas-${sessionId}-name`, newName);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!roomId || !user) return;

    const syncCanvas = async () => {
      setIsLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
      const token = localStorage.getItem('token');

      try {
        const response = await fetch(`${apiUrl}/canvas/room/${roomId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setCanvasId(data.id);
          setSessionName(data.title || sessionName);
          return;
        }

        if (response.status === 404) {
          const createResponse = await fetch(`${apiUrl}/canvas`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              roomId,
              title: sessionName || `Canvas ${roomId.slice(-6)}`,
              description: 'Collaborative brainstorming canvas',
              isPublic: false,
            }),
          });

          if (createResponse.ok) {
            const newCanvas = await createResponse.json();
            setCanvasId(newCanvas.id);
          }
        }
      } catch (error) {
        console.error('Failed to sync canvas:', error);
      } finally {
        setIsLoading(false);
      }
    };

    syncCanvas();
  }, [roomId, user, sessionName]);

  const handleCreateNewCanvas = () => {
    const newSessionId = generateRoomId();
    router.push(`/brainstorm?session=${newSessionId}`);
  };

  const handleDownloadJSON = async () => {
    setIsLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${apiUrl}/canvas/room/${roomId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `canvas-${roomId}-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download canvas data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
            Please log in to use Brainstorm Canvas
          </h1>
          <button
            onClick={() => router.push('/auth/login')}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col bg-gray-50 dark:bg-gray-950">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Brainstorming Canvas</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{sessionName}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={handleCreateNewCanvas}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800"
            >
              New Canvas
            </button>
            <button
              onClick={handleDownloadJSON}
              disabled={isLoading}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-800"
            >
              {isLoading ? 'Downloading...' : 'Export JSON'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Canvas component */}
        <div className="min-h-0 flex-1">
          {roomId && user ? (
            <CollaborativeCanvas
              roomId={roomId}
              userId={user.id}
              onCanvasReady={() => {
                // Canvas is ready
              }}
            />
          ) : (
            <div className="flex h-full flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
                <p className="text-gray-600 dark:text-gray-400">Initializing canvas...</p>
              </div>
            </div>
          )}
        </div>

        {roomId && (
          <div className="h-[420px] shrink-0 lg:h-auto">
            <EncryptedRoomChat roomId={roomId} />
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="border-t border-gray-200 bg-white px-6 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Room ID: {roomId}</span>
          <span>
            Share this link with others to collaborate:{' '}
            <code className="rounded bg-gray-100 px-2 py-1 font-mono dark:bg-gray-800">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/brainstorm?session=${roomId}`
                : ''}
            </code>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BrainstormPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <BrainstormContent />
    </Suspense>
  );
}
