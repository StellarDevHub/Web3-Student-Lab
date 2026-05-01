"use client";

import { editor } from "monaco-editor";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  RemoteCursor,
} from "./RemoteCursor";
import {
  useRemoteCursorStates,
  useLocalCursorTracker,
  getCursorPixelPosition,
  isUserInactive,
  PixelCursorPosition,
  RemoteUserState,
} from "@/lib/cursor/CursorSync";

interface CursorManagerProps {
  editor: editor.IStandaloneCodeEditor | null;
  awareness: any;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface CursorRenderState {
  clientId: number;
  name: string;
  color: string;
  pixel: PixelCursorPosition;
  isActive: boolean;
}

export function CursorManager({
  editor,
  awareness,
  containerRef,
}: CursorManagerProps) {
  // Track local cursor and broadcast to awareness
  useLocalCursorTracker(editor, awareness);

  // Read remote cursor states
  const remoteUsers = useRemoteCursorStates(awareness);

  const [cursorStates, setCursorStates] = useState<CursorRenderState[]>([]);
  const animationFrameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  const updateCursorPositions = useCallback(() => {
    if (!editor) {
      setCursorStates([]);
      return;
    }

    const now = Date.now();
    // Limit updates to ~60fps to avoid excessive re-renders
    if (now - lastUpdateRef.current < 16) {
      animationFrameRef.current = requestAnimationFrame(updateCursorPositions);
      return;
    }
    lastUpdateRef.current = now;

    const newStates: CursorRenderState[] = [];

    remoteUsers.forEach((user: RemoteUserState) => {
      if (!user.cursor) return;

      const pixel = getCursorPixelPosition(editor, user.cursor);
      const active = !isUserInactive(user.lastActivity);

      // Only render if visible or was recently active
      if (pixel.visible || active) {
        newStates.push({
          clientId: user.clientId,
          name: user.name,
          color: user.color,
          pixel,
          isActive: active,
        });
      }
    });

    setCursorStates(newStates);
    animationFrameRef.current = requestAnimationFrame(updateCursorPositions);
  }, [editor, remoteUsers]);

  useEffect(() => {
    if (!editor || !awareness) {
      setCursorStates([]);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateCursorPositions);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [editor, awareness, updateCursorPositions]);

  // Also update on scroll and resize events for immediate response
  useEffect(() => {
    if (!editor) return;

    const disposable = editor.onDidScrollChange(() => {
      // Trigger immediate update
      lastUpdateRef.current = 0;
    });

    const layoutDisposable = editor.onDidLayoutChange(() => {
      lastUpdateRef.current = 0;
    });

    return () => {
      disposable.dispose();
      layoutDisposable.dispose();
    };
  }, [editor]);

  if (cursorStates.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      {cursorStates.map((cursor) => (
        <RemoteCursor
          key={cursor.clientId}
          x={cursor.pixel.x}
          y={cursor.pixel.y}
          height={cursor.pixel.height}
          color={cursor.color}
          name={cursor.name}
          isActive={cursor.isActive}
          visible={cursor.pixel.visible}
        />
      ))}
    </div>
  );
}
