import { nanoid } from 'nanoid';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export class CollaborationProviderFixed {
  public doc: Y.Doc;
  public provider: WebsocketProvider;
  public awareness: any;
  public localUser: { name: string; color: string };
  public roomId: string;
  public isDestroyed: boolean = false;

  // Memory management
  private observers: Array<() => void> = [];
  private eventListeners: Map<
    'connection-close' | 'status' | 'connection-error' | 'sync',
    Array<(...args: any[]) => void>
  > = new Map();
  private cleanupCallbacks: Array<() => void> = [];

  constructor(roomName: string) {
    this.roomId = roomName;
    this.doc = new Y.Doc();

    // Use a local websocket server URL or a public one for testing
    // In production, this should be the same host as the backend
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

    this.provider = new WebsocketProvider(wsUrl, roomName, this.doc);
    this.awareness = this.provider.awareness;

    const colors = [
      '#f87171',
      '#fb923c',
      '#fbbf24',
      '#a3e635',
      '#4ade80',
      '#2dd4bf',
      '#22d3ee',
      '#38bdf8',
      '#818cf8',
      '#a78bfa',
      '#e879f9',
      '#f472b6',
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    this.localUser = {
      name: `Student ${nanoid(4)}`,
      color: randomColor,
    };

    this.awareness.setLocalStateField('user', this.localUser);

    // Set up automatic cleanup on page unload
    if (typeof window !== 'undefined') {
      this.setupPageUnloadCleanup();
    }
  }

  private setupPageUnloadCleanup(): void {
    const handleUnload = () => {
      this.destroy();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there are unsynced changes
      if (this.hasUnsyncedChanges()) {
        e.preventDefault();
        e.returnValue = 'You have unsynced changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('unload', handleUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);

    this.cleanupCallbacks.push(() => {
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    });
  }

  private hasUnsyncedChanges(): boolean {
    // Check if the document has unsynced changes
    // This is a simplified check - in production you might want more sophisticated logic
    return !!(this.provider && !(this.provider as any).synced);
  }

  // Safe event listener management
  public addEventListener(
    event: 'connection-close' | 'status' | 'connection-error' | 'sync',
    callback: (...args: any[]) => void
  ): void {
    if (this.isDestroyed) return;

    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    this.eventListeners.get(event)!.push(callback);

    // Add the actual listener to the provider
    if (this.provider) {
      this.provider.on(event, callback);
    }
  }

  public removeEventListener(
    event: 'connection-close' | 'status' | 'connection-error' | 'sync',
    callback: (...args: any[]) => void
  ): void {
    if (this.isDestroyed) return;

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }

    // Remove the actual listener from the provider
    if (this.provider) {
      this.provider.off(event, callback);
    }
  }

  // Safe observer management
  public addObserver(callback: () => void): void {
    if (this.isDestroyed) return;

    this.observers.push(callback);
  }

  public removeObserver(callback: () => void): void {
    const index = this.observers.indexOf(callback);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  // Get Yjs data structures with proper cleanup tracking
  public getArray<T = any>(name: string): Y.Array<T> {
    if (this.isDestroyed) {
      throw new Error('Cannot access array on destroyed provider');
    }
    return this.doc.getArray<T>(name);
  }

  public getText(name: string): Y.Text {
    if (this.isDestroyed) {
      throw new Error('Cannot access text on destroyed provider');
    }
    return this.doc.getText(name);
  }

  public getMap<T = any>(name: string): Y.Map<T> {
    if (this.isDestroyed) {
      throw new Error('Cannot access map on destroyed provider');
    }
    return this.doc.getMap<T>(name);
  }

  // Memory usage monitoring
  public getMemoryUsage(): { docSize: number; observerCount: number; listenerCount: number } {
    if (this.isDestroyed) {
      return { docSize: 0, observerCount: 0, listenerCount: 0 };
    }

    let docSize = 0;
    try {
      // Estimate document size
      const json = this.doc.toJSON();
      docSize = JSON.stringify(json).length;
    } catch (error) {
      console.warn('Failed to calculate document size:', error);
    }

    let listenerCount = 0;
    this.eventListeners.forEach((listeners) => {
      listenerCount += listeners.length;
    });

    return {
      docSize,
      observerCount: this.observers.length,
      listenerCount,
    };
  }

  // Force garbage collection hint (works in some browsers)
  public forceGC(): void {
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc();
    }
  }

  // Enhanced destroy method
  public destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    try {
      // Clean up all event listeners
      this.eventListeners.forEach((listeners, event) => {
        listeners.forEach((callback) => {
          if (this.provider) {
            this.provider.off(event, callback);
          }
        });
      });
      this.eventListeners.clear();

      // Clean up all observers
      this.observers.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.warn('Error during observer cleanup:', error);
        }
      });
      this.observers = [];

      // Clean up awareness
      if (this.awareness) {
        this.awareness.destroy();
      }

      // Clean up provider
      if (this.provider) {
        this.provider.destroy();
      }

      // Clean up document
      if (this.doc) {
        this.doc.destroy();
      }

      // Run cleanup callbacks
      this.cleanupCallbacks.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.warn('Error during cleanup callback:', error);
        }
      });
      this.cleanupCallbacks = [];

      console.log(`CollaborationProvider for room ${this.roomId} destroyed successfully`);
    } catch (error) {
      console.error('Error during CollaborationProvider destruction:', error);
    }
  }

  // Check if provider is still valid
  public isValid(): boolean {
    return !this.isDestroyed && !!this.doc && !!this.provider;
  }

  // Reconnect if disconnected
  public reconnect(): void {
    if (this.isDestroyed || !this.provider) return;

    try {
      this.provider.connect();
    } catch (error) {
      console.error('Failed to reconnect:', error);
    }
  }

  // Disconnect manually
  public disconnect(): void {
    if (this.isDestroyed || !this.provider) return;

    try {
      this.provider.disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }
}

// Factory function with memory management
export class CollaborationProviderFactory {
  private static providers = new Map<string, CollaborationProviderFixed>();
  private static readonly MAX_PROVIDERS = 5;
  private static readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private static cleanupTimer: NodeJS.Timeout | null = null;

  static getProvider(roomName: string): CollaborationProviderFixed {
    const existing = this.providers.get(roomName);

    if (existing && existing.isValid()) {
      return existing;
    }

    // Clean up old providers if we have too many
    if (this.providers.size >= this.MAX_PROVIDERS) {
      this.cleanupOldestProvider();
    }

    const provider = new CollaborationProviderFixed(roomName);
    this.providers.set(roomName, provider);

    // Start cleanup timer if not already running
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupInvalidProviders();
      }, this.CLEANUP_INTERVAL);
    }

    return provider;
  }

  static destroyProvider(roomName: string): void {
    const provider = this.providers.get(roomName);
    if (provider) {
      provider.destroy();
      this.providers.delete(roomName);
    }

    if (this.providers.size === 0 && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  static cleanupInvalidProviders(): void {
    const toDelete: string[] = [];

    this.providers.forEach((provider, roomName) => {
      if (!provider.isValid()) {
        toDelete.push(roomName);
      }
    });

    toDelete.forEach((roomName) => {
      this.destroyProvider(roomName);
    });

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} invalid providers`);
    }
  }

  static cleanupOldestProvider(): void {
    if (this.providers.size === 0) return;

    const firstKey = this.providers.keys().next().value;
    if (firstKey) {
      this.destroyProvider(firstKey);
    }
  }

  static destroyAllProviders(): void {
    const roomNames = Array.from(this.providers.keys());
    roomNames.forEach((roomName) => {
      this.destroyProvider(roomName);
    });

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log(`Destroyed all ${roomNames.length} providers`);
  }

  static getStats(): { providerCount: number; totalMemoryUsage: number } {
    let totalMemoryUsage = 0;

    this.providers.forEach((provider) => {
      const usage = provider.getMemoryUsage();
      totalMemoryUsage += usage.docSize;
    });

    return {
      providerCount: this.providers.size,
      totalMemoryUsage,
    };
  }
}
