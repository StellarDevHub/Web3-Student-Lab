"use client";

import type * as Y from "yjs";
import { DatabaseManager } from "@/lib/storage/DatabaseManager";

type SyncState = "idle" | "syncing" | "offline" | "error";

const PENDING_CHANGES_KEY = "storage:pending-changes";

export class SyncManager {
  private databaseManager: DatabaseManager;
  private state: SyncState = "idle";
  private listeners = new Set<(state: SyncState) => void>();

  constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
  }

  subscribe(listener: (state: SyncState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: SyncState) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  getState() {
    return this.state;
  }

  trackPendingChange(changeId: string) {
    const pending = this.getPendingChanges();
    if (!pending.includes(changeId)) {
      pending.push(changeId);
      this.setPendingChanges(pending);
    }
  }

  resolvePendingChange(changeId: string) {
    const pending = this.getPendingChanges().filter((id) => id !== changeId);
    this.setPendingChanges(pending);
  }

  getPendingChanges(): string[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(PENDING_CHANGES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private setPendingChanges(changes: string[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
  }

  attachYDocPersistence(doc: Y.Doc, storageKey: string) {
    const persist = async () => {
      try {
        const update = Y.encodeStateAsUpdate(doc);
        const serialized = Array.from(update).join(",");
        await this.databaseManager.setMetadata(`ydoc:${storageKey}`, serialized);
      } catch {
        this.setState("error");
      }
    };

    doc.on("update", persist);
    return async () => {
      doc.off("update", persist);
      await persist();
    };
  }

  async restoreYDoc(doc: Y.Doc, storageKey: string) {
    const stored = await this.databaseManager.getMetadata(`ydoc:${storageKey}`);
    if (!stored?.value) return;
    const bytes = new Uint8Array(stored.value.split(",").map((item) => Number(item)));
    if (bytes.length > 0) {
      Y.applyUpdate(doc, bytes);
    }
  }

  async syncPendingUploads(runUpload: (changeId: string) => Promise<void>) {
    if (!navigator.onLine) {
      this.setState("offline");
      return;
    }

    this.setState("syncing");
    try {
      const pending = this.getPendingChanges();
      for (const changeId of pending) {
        await runUpload(changeId);
        this.resolvePendingChange(changeId);
      }
      this.setState("idle");
    } catch {
      this.setState("error");
    }
  }
}
