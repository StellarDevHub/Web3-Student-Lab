import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { CommentReply, CommentThread } from "../../components/review/InlineComment";
import { ReviewRequest, ReviewSummary } from "./ReviewManager";

export interface CommentSyncUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface CommentSyncEvents {
  "comment-added": (comment: CommentThread) => void;
  "comment-updated": (commentId: string, comment: CommentThread) => void;
  "comment-deleted": (commentId: string) => void;
  "reply-added": (commentId: string, reply: CommentReply) => void;
  "user-joined": (user: CommentSyncUser) => void;
  "user-left": (userId: string) => void;
  "user-cursor": (userId: string, cursor: { line: number; column: number }) => void;
  "user-selection": (userId: string, selection: { start: { line: number; column: number }; end: { line: number; column: number } }) => void;
}

export class CommentSync {
  private doc: Y.Doc;
  private provider: WebsocketProvider;
  private awareness: any;
  private commentsMap: Y.Map<any>;
  private usersMap: Y.Map<any>;
  private eventListeners: Map<keyof CommentSyncEvents, Set<Function>> = new Map();
  private localUser: CommentSyncUser;
  private roomId: string;

  constructor(roomId: string, user: CommentSyncUser, wsUrl?: string) {
    this.roomId = roomId;
    this.localUser = user;

    // Initialize Yjs document
    this.doc = new Y.Doc();

    // Connect to WebSocket server
    const websocketUrl = wsUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    this.provider = new WebsocketProvider(websocketUrl, roomId, this.doc);
    this.awareness = this.provider.awareness;

    // Initialize Yjs data structures
    this.commentsMap = this.doc.getMap('comments');
    this.usersMap = this.doc.getMap('users');

    // Set up local user in awareness
    this.setupAwareness();

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupAwareness() {
    // Set local user state
    this.awareness.setLocalStateField('user', this.localUser);

    // Handle awareness changes
    this.awareness.on('change', () => {
      const states = this.awareness.getStates() as Map<string, any>;

      states.forEach((state, clientId) => {
        if (clientId !== this.awareness.clientID && state.user) {
          this.emit('user-joined', state.user);
        }
      });
    });

    // Handle user leaving
    this.awareness.on('destroy', () => {
      const states = this.awareness.getStates() as Map<string, any>;
      const currentUserIds = new Set(states.keys());

      // Get previous user IDs and emit leave events for users that are no longer present
      this.usersMap.forEach((_, userId) => {
        if (!currentUserIds.has(userId)) {
          this.emit('user-left', userId);
        }
      });
    });
  }

  private setupEventListeners() {
    // Listen for changes to comments
    this.commentsMap.observe((event: Y.YMapEvent<any>) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add') {
          const comment = this.commentsMap.get(key);
          this.emit('comment-added', comment);
        } else if (change.action === 'update') {
          const comment = this.commentsMap.get(key);
          this.emit('comment-updated', key, comment);
        } else if (change.action === 'delete') {
          this.emit('comment-deleted', key);
        }
      });
    });

    // Listen for changes to users
    this.usersMap.observe((event: Y.YMapEvent<any>) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'update') {
          const user = this.usersMap.get(key);
          if (user.cursor) {
            this.emit('user-cursor', key, user.cursor);
          }
          if (user.selection) {
            this.emit('user-selection', key, user.selection);
          }
        }
      });
    });
  }

  // Event handling
  on<K extends keyof CommentSyncEvents>(event: K, listener: CommentSyncEvents[K]) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off<K extends keyof CommentSyncEvents>(event: K, listener: CommentSyncEvents[K]) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit<K extends keyof CommentSyncEvents>(event: K, ...args: any[]) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Comment operations
  addComment(comment: CommentThread) {
    const yComment = this.doc.getMap('comments');
    yComment.set(comment.id, comment);
  }

  updateComment(commentId: string, updates: Partial<CommentThread>) {
    const yComment = this.doc.getMap('comments');
    const existing = yComment.get(commentId);

    if (existing) {
      const updated = { ...existing, ...updates };
      yComment.set(commentId, updated);
    }
  }

  deleteComment(commentId: string) {
    const yComment = this.doc.getMap('comments');
    yComment.delete(commentId);
  }

  addReply(commentId: string, reply: CommentReply) {
    const yComment = this.doc.getMap('comments');
    const comment = yComment.get(commentId) as CommentThread;

    if (comment) {
      const updated: CommentThread = {
        ...comment,
        replies: [...(comment.replies || []), reply]
      };
      yComment.set(commentId, updated);
      this.emit('reply-added', commentId, reply);
    }
  }

  getComments(): CommentThread[] {
    const yComment = this.doc.getMap('comments');
    return Array.from(yComment.values()) as CommentThread[];
  }

  getComment(commentId: string): CommentThread | null {
    const yComment = this.doc.getMap('comments');
    return (yComment.get(commentId) as CommentThread) || null;
  }

  // User presence operations
  updateCursor(position: { line: number; column: number }) {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalStateField('user', {
      ...currentState.user,
      cursor: position
    });
  }

  updateSelection(selection: { start: { line: number; column: number }; end: { line: number; column: number } }) {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalStateField('user', {
      ...currentState.user,
      selection
    });
  }

  clearCursor() {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalStateField('user', {
      ...currentState.user,
      cursor: undefined
    });
  }

  clearSelection() {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalStateField('user', {
      ...currentState.user,
      selection: undefined
    });
  }

  getConnectedUsers(): CommentSyncUser[] {
    const states = this.awareness.getStates() as Map<string, any>;
    return Array.from(states.values())
      .filter(state => state.user)
      .map(state => state.user);
  }

  // Review synchronization
  syncReview(review: ReviewRequest) {
    const yReviews = this.doc.getMap('reviews');
    yReviews.set(review.id, review);
  }

  getReview(reviewId: string): ReviewRequest | null {
    const yReviews = this.doc.getMap('reviews');
    return (yReviews.get(reviewId) as ReviewRequest) || null;
  }

  getAllReviews(): ReviewRequest[] {
    const yReviews = this.doc.getMap('reviews');
    return Array.from(yReviews.values()) as ReviewRequest[];
  }

  syncReviewSummary(reviewId: string, summary: ReviewSummary) {
    const ySummaries = this.doc.getMap(`summaries-${reviewId}`);
    if (!ySummaries.has(summary.id)) {
      ySummaries.set(summary.id, summary);
    } else {
      ySummaries.set(summary.id, summary);
    }
  }

  getReviewSummaries(reviewId: string): ReviewSummary[] {
    const ySummaries = this.doc.getMap(`summaries-${reviewId}`);
    return Array.from(ySummaries.values()) as ReviewSummary[];
  }

  // Utility methods
  isConnected(): boolean {
    return this.provider.wsconnected;
  }

  getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' {
    if (this.provider.wsconnected) return 'connected';
    if (this.provider.shouldConnect) return 'connecting';
    return 'disconnected';
  }

  // Destroy the sync instance
  destroy() {
    this.provider.destroy();
    this.doc.destroy();
    this.eventListeners.clear();
  }

  // Batch operations for better performance
  batchUpdate(callback: () => void) {
    this.doc.transact(() => {
      callback();
    });
  }

  // Import/export functionality
  exportComments(): string {
    const state = Y.encodeStateAsUpdate(this.doc);
    return Buffer.from(state).toString('base64');
  }

  importComments(data: string) {
    const state = Buffer.from(data, 'base64');
    Y.applyUpdate(this.doc, state);
  }

  // Conflict resolution helpers
  resolveCommentConflict(commentId: string, resolution: 'local' | 'remote' | 'merge') {
    const yComment = this.doc.getMap('comments');
    const localComment = yComment.get(commentId);

    if (!localComment) return;

    switch (resolution) {
      case 'local':
        // Keep local version (do nothing)
        break;
      case 'remote':
        // Fetch remote version and apply
        // This would require additional logic to determine remote version
        break;
      case 'merge':
        // Implement merge logic
        // This would require custom merge strategies
        break;
    }
  }
}

// React hook for using CommentSync
import { useCallback, useEffect, useState } from "react";

export function useCommentSync(roomId: string, user: CommentSyncUser, wsUrl?: string) {
  const [sync, setSync] = useState<CommentSync | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<CommentSyncUser[]>([]);

  useEffect(() => {
    const commentSync = new CommentSync(roomId, user, wsUrl);
    setSync(commentSync);

    // Set up event listeners
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleUserJoined = (newUser: CommentSyncUser) => {
      setConnectedUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    };
    const handleUserLeft = (userId: string) => {
      setConnectedUsers(prev => prev.filter(u => u.id !== userId));
    };

    commentSync.on('user-joined', handleUserJoined);
    commentSync.on('user-left', handleUserLeft);

    // Set up connection status monitoring
    const checkConnection = () => {
      setIsConnected(commentSync.isConnected());
      setConnectedUsers(commentSync.getConnectedUsers());
    };

    const interval = setInterval(checkConnection, 1000);
    checkConnection();

    return () => {
      clearInterval(interval);
      commentSync.destroy();
    };
  }, [roomId, user, wsUrl]);

  const addComment = useCallback((comment: CommentThread) => {
    if (sync) sync.addComment(comment);
  }, [sync]);

  const updateComment = useCallback((commentId: string, updates: Partial<CommentThread>) => {
    if (sync) sync.updateComment(commentId, updates);
  }, [sync]);

  const deleteComment = useCallback((commentId: string) => {
    if (sync) sync.deleteComment(commentId);
  }, [sync]);

  const addReply = useCallback((commentId: string, reply: CommentReply) => {
    if (sync) sync.addReply(commentId, reply);
  }, [sync]);

  const updateCursor = useCallback((position: { line: number; column: number }) => {
    if (sync) sync.updateCursor(position);
  }, [sync]);

  const updateSelection = useCallback((selection: { start: { line: number; column: number }; end: { line: number; column: number } }) => {
    if (sync) sync.updateSelection(selection);
  }, [sync]);

  return {
    sync,
    isConnected,
    connectedUsers,
    addComment,
    updateComment,
    deleteComment,
    addReply,
    updateCursor,
    updateSelection,
  };
}
