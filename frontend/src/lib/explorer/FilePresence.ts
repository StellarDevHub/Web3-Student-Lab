"use client";

import type * as Y from "yjs";

export interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
}

export interface PresenceState {
  activeFilePath?: string;
  user?: {
    name?: string;
    color?: string;
  };
}

const FOLDER_STATE_STORAGE_KEY = "playground-folder-state-v1";

export class FilePresenceManager {
  private awareness: any;
  private folderStateMap: Y.Map<boolean>;
  private localClientId: number;

  constructor(awareness: any, folderStateMap: Y.Map<boolean>, localClientId: number) {
    this.awareness = awareness;
    this.folderStateMap = folderStateMap;
    this.localClientId = localClientId;
  }

  getAwareness() {
    return this.awareness;
  }

  setActiveFile(activeFilePath: string) {
    this.awareness.setLocalStateField("activeFilePath", activeFilePath);
  }

  getUsersForFile(filePath: string): PresenceUser[] {
    const users: PresenceUser[] = [];
    const states = this.awareness.getStates() as Map<number, PresenceState>;
    states.forEach((state, clientId) => {
      if (clientId === this.localClientId) return;
      if (state.activeFilePath !== filePath) return;
      if (!state.user?.name || !state.user?.color) return;
      users.push({
        clientId,
        name: state.user.name,
        color: state.user.color,
      });
    });
    return users;
  }

  setFolderExpanded(folderPath: string, isExpanded: boolean) {
    this.folderStateMap.set(folderPath, isExpanded);
    this.persistFolderState();
  }

  isFolderExpanded(folderPath: string): boolean {
    const value = this.folderStateMap.get(folderPath);
    if (typeof value === "boolean") {
      return value;
    }
    return true;
  }

  hydrateFolderStateFromStorage() {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(FOLDER_STATE_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      Object.entries(parsed).forEach(([path, expanded]) => {
        this.folderStateMap.set(path, !!expanded);
      });
    } catch {
      // Ignore malformed local cache.
    }
  }

  private persistFolderState() {
    if (typeof window === "undefined") return;
    const state: Record<string, boolean> = {};
    this.folderStateMap.forEach((value, key) => {
      state[key] = !!value;
    });
    window.localStorage.setItem(FOLDER_STATE_STORAGE_KEY, JSON.stringify(state));
  }
}
