"use client";

import React from "react";

interface OfflineIndicatorProps {
  isOnline: boolean;
  syncState: "idle" | "syncing" | "offline" | "error";
  pendingCount: number;
  onManualSync: () => void;
}

export function OfflineIndicator({
  isOnline,
  syncState,
  pendingCount,
  onManualSync,
}: OfflineIndicatorProps) {
  const toneClass = !isOnline
    ? "text-amber-400 border-amber-400/30"
    : syncState === "error"
      ? "text-red-400 border-red-400/30"
      : syncState === "syncing"
        ? "text-blue-400 border-blue-400/30"
        : "text-green-400 border-green-400/30";

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${toneClass}`}>
      <span>{isOnline ? "Online" : "Offline Mode"}</span>
      <span>Sync: {syncState}</span>
      <span>Pending: {pendingCount}</span>
      <button
        onClick={onManualSync}
        className="rounded border border-white/20 px-2 py-1 text-[9px] text-white hover:bg-white/10"
      >
        Sync now
      </button>
    </div>
  );
}
