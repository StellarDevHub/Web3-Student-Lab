import { editor } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface RemoteUserState {
  clientId: number;
  name: string;
  color: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  lastActivity: number;
}

export interface PixelCursorPosition {
  x: number;
  y: number;
  height: number;
  visible: boolean;
}

const THROTTLE_MS = 50;
const INACTIVITY_TIMEOUT_MS = 30000;
const COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#4ade80",
  "#2dd4bf",
  "#22d3ee",
  "#38bdf8",
  "#818cf8",
  "#a78bfa",
  "#e879f9",
  "#f472b6",
];

let colorIndex = 0;
export function assignUserColor(name: string): string {
  // Deterministic color assignment based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function getNextAssignedColor(): string {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return color;
}

export function resetColorAssignment(): void {
  colorIndex = 0;
}

function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limitMs: number
): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limitMs - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/**
 * Broadcast local cursor position to Yjs awareness with throttling.
 */
export function useLocalCursorTracker(
  editor: editor.IStandaloneCodeEditor | null,
  awareness: any
) {
  const awarenessRef = useRef(awareness);
  awarenessRef.current = awareness;

  useEffect(() => {
    if (!editor || !awareness) return;

    const broadcastCursor = throttle(() => {
      const position = editor.getPosition();
      const selection = editor.getSelection();
      if (!position) return;

      const localState = awarenessRef.current.getLocalState() || {};
      const cursorData: CursorPosition = {
        line: position.lineNumber,
        column: position.column,
      };

      let selectionData: SelectionRange | undefined;
      if (selection && !selection.isEmpty()) {
        selectionData = {
          start: {
            line: selection.startLineNumber,
            column: selection.startColumn,
          },
          end: {
            line: selection.endLineNumber,
            column: selection.endColumn,
          },
        };
      }

      awarenessRef.current.setLocalState({
        ...localState,
        cursor: cursorData,
        selection: selectionData,
        lastActivity: Date.now(),
      });
    }, THROTTLE_MS);

    const disposable = editor.onDidChangeCursorPosition(() => {
      broadcastCursor();
    });

    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
      broadcastCursor();
    });

    // Broadcast initial position
    broadcastCursor();

    return () => {
      disposable.dispose();
      selectionDisposable.dispose();
    };
  }, [editor, awareness]);
}

/**
 * Read remote cursor states from Yjs awareness.
 */
export function useRemoteCursorStates(awareness: any): RemoteUserState[] {
  const [users, setUsers] = useState<RemoteUserState[]>([]);

  useEffect(() => {
    if (!awareness) {
      setUsers([]);
      return;
    }

    const updateUsers = () => {
      const states = awareness.getStates() as Map<number, any>;
      const now = Date.now();
      const remoteUsers: RemoteUserState[] = [];

      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        if (!state || !state.user) return;

        remoteUsers.push({
          clientId,
          name: state.user.name || `User ${clientId}`,
          color: state.user.color || assignUserColor(state.user.name || ""),
          cursor: state.cursor,
          selection: state.selection,
          lastActivity: state.lastActivity || now,
        });
      });

      setUsers(remoteUsers);
    };

    awareness.on("change", updateUsers);
    updateUsers();

    return () => {
      awareness.off("change", updateUsers);
    };
  }, [awareness]);

  return users;
}

/**
 * Convert a cursor position to pixel coordinates within the editor viewport.
 */
export function getCursorPixelPosition(
  editor: editor.IStandaloneCodeEditor,
  cursor: CursorPosition
): PixelCursorPosition {
  const pos = {
    lineNumber: cursor.line,
    column: cursor.column,
  };

  // getScrolledVisiblePosition returns coordinates relative to the editor viewport
  const visiblePos = editor.getScrolledVisiblePosition(pos);

  if (!visiblePos) {
    return { x: 0, y: 0, height: 0, visible: false };
  }

  const editorDom = editor.getDomNode();
  if (!editorDom) {
    return { x: 0, y: 0, height: 0, visible: false };
  }

  // Account for editor padding/offset
  const linesContent = editorDom.querySelector(".lines-content") as HTMLElement;
  if (!linesContent) {
    return {
      x: visiblePos.left,
      y: visiblePos.top,
      height: visiblePos.height,
      visible: true,
    };
  }

  const contentRect = linesContent.getBoundingClientRect();
  const editorRect = editorDom.getBoundingClientRect();

  return {
    x: contentRect.left - editorRect.left + visiblePos.left,
    y: contentRect.top - editorRect.top + visiblePos.top,
    height: visiblePos.height,
    visible: true,
  };
}

/**
 * Get a stable color for a user name.
 */
export function getUserColor(name: string): string {
  return assignUserColor(name);
}

/**
 * Check if a user has timed out due to inactivity.
 */
export function isUserInactive(lastActivity: number): boolean {
  return Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS;
}
