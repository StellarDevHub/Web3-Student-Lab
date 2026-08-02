import { nanoid } from 'nanoid';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export class CollaborationProvider {
  public doc: Y.Doc;
  public provider: WebsocketProvider;
  public awareness: any;
  public localUser: { name: string; color: string };

  constructor(roomName: string) {
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
  }

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}
