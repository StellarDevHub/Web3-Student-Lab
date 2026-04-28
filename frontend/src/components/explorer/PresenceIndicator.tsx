"use client";

import React from "react";
import type { PresenceUser } from "@/lib/explorer/FilePresence";

interface PresenceIndicatorProps {
  users: PresenceUser[];
}

export function PresenceIndicator({ users }: PresenceIndicatorProps) {
  if (!users.length) {
    return null;
  }

  return (
    <div className="ml-2 flex items-center -space-x-1">
      {users.slice(0, 3).map((user) => (
        <div
          key={user.clientId}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-black text-[8px] font-bold uppercase text-black"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.slice(0, 2)}
        </div>
      ))}
      {users.length > 3 && (
        <div
          className="ml-1 rounded-full border border-white/20 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-white"
          title={users.map((user) => user.name).join(", ")}
        >
          +{users.length - 3}
        </div>
      )}
    </div>
  );
}
