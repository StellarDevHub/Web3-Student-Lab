'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MeshPeerState } from '@/services/webrtc/meshRoom';

export interface VideoStripProps {
  localDisplayName?: string;
  localStream: MediaStream | null;
  peers: MeshPeerState[];
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  pushToTalkEnabled: boolean;
  pushToTalkActive: boolean;
  audioBitrateBps: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onTogglePushToTalkMode: (enabled: boolean) => void;
  onPushToTalkPressChange: (pressed: boolean) => void;
  onLeave: () => void;
}

function StreamTile({
  stream,
  label,
  mutedSelf = false,
  audioMuted = false,
  videoOff = false,
  screenSharing = false,
}: {
  stream: MediaStream | null;
  label: string;
  mutedSelf?: boolean;
  audioMuted?: boolean;
  videoOff?: boolean;
  screenSharing?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative h-24 w-36 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      {stream && !videoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={mutedSelf}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-800 text-xs font-semibold text-slate-300">
          {label.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1">
          {screenSharing && (
            <span className="rounded bg-cyan-600 px-1 text-[9px]" title="Screen sharing">
              SCR
            </span>
          )}
          {audioMuted && (
            <span className="rounded bg-rose-600 px-1 text-[9px]" title="Microphone muted">
              MUTE
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export const VideoStrip: React.FC<VideoStripProps> = ({
  localDisplayName = 'You',
  localStream,
  peers,
  audioMuted,
  videoOff,
  screenSharing,
  pushToTalkEnabled,
  pushToTalkActive,
  audioBitrateBps,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onTogglePushToTalkMode,
  onPushToTalkPressChange,
  onLeave,
}) => {
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragOriginRef.current) return;
      const dx = e.clientX - dragOriginRef.current.startX;
      const dy = e.clientY - dragOriginRef.current.startY;
      setPosition({
        x: Math.max(0, dragOriginRef.current.origX + dx),
        y: Math.max(0, dragOriginRef.current.origY + dy),
      });
    };
    const handleMouseUp = () => {
      dragOriginRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 text-slate-100 shadow-2xl backdrop-blur"
      data-testid="webrtc-video-strip"
    >
      <div
        onMouseDown={handleMouseDown}
        className="flex cursor-move items-center justify-between border-b border-slate-800 pb-1.5 text-xs text-slate-400 select-none"
      >
        <span className="font-medium text-slate-200">
          Mentorship Mesh ({peers.length + 1}/4 peers)
        </span>
        <span className="text-[10px] text-cyan-400">
          {Math.round(audioBitrateBps / 1000)} kbps
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <StreamTile
          stream={localStream}
          label={localDisplayName}
          mutedSelf
          audioMuted={audioMuted}
          videoOff={videoOff}
          screenSharing={screenSharing}
        />
        {peers.map((peer) => (
          <StreamTile
            key={peer.peerId}
            stream={peer.stream}
            label={peer.displayName}
            audioMuted={peer.audioMuted}
            videoOff={peer.videoOff}
            screenSharing={peer.screenSharing}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={onToggleMute}
          className={`rounded px-2 py-1 text-xs font-medium ${
            audioMuted ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          {audioMuted ? 'Unmute' : 'Mute'}
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          className={`rounded px-2 py-1 text-xs font-medium ${
            videoOff ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          {videoOff ? 'Camera On' : 'Camera Off'}
        </button>

        <button
          type="button"
          onClick={onToggleScreenShare}
          className={`rounded px-2 py-1 text-xs font-medium ${
            screenSharing ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          {screenSharing ? 'Stop Share' : 'Share Screen'}
        </button>

        <button
          type="button"
          onClick={() => onTogglePushToTalkMode(!pushToTalkEnabled)}
          className={`rounded px-2 py-1 text-xs font-medium ${
            pushToTalkEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          PTT: {pushToTalkEnabled ? 'ON' : 'OFF'}
        </button>

        {pushToTalkEnabled && (
          <button
            type="button"
            onMouseDown={() => onPushToTalkPressChange(true)}
            onMouseUp={() => onPushToTalkPressChange(false)}
            onMouseLeave={() => onPushToTalkPressChange(false)}
            className={`rounded px-2 py-1 text-xs font-semibold ${
              pushToTalkActive ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'
            }`}
          >
            {pushToTalkActive ? 'Talking...' : 'Hold to Talk'}
          </button>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="ml-auto rounded bg-rose-700 px-2 py-1 text-xs font-medium text-white hover:bg-rose-600"
        >
          Leave
        </button>
      </div>
    </div>
  );
};
