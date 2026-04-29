import { listen, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import {
    MonacoLanguageClient,
    MessageTransports,
} from 'monaco-languageclient';
import {
    createWebSocket,
    toSocket,
    WebSocket
} from 'vscode-ws-jsonrpc';

export class LSPClient {
    private client: MonacoLanguageClient | null = null;
    private socket: WebSocket | null = null;

    constructor(private url: string, private language: string) {}

    public connect() {
        if (this.client) return;

        this.socket = createWebSocket(this.url);
        const socket = toSocket(this.socket);

        listen({
            webSocket: this.socket as any,
            onMessage: (message) => {
                console.log('LSP Message:', message);
            },
        });

        const reader = new WebSocketMessageReader(socket);
        const writer = new WebSocketMessageWriter(socket);

        this.client = this.createLanguageClient({ reader, writer });
        this.client.start();
    }

    private createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
        return new MonacoLanguageClient({
            name: `${this.language} Language Client`,
            clientOptions: {
                documentSelector: [this.language],
                errorHandler: {
                    error: () => ({ action: 1 }), // Continue
                    closed: () => ({ action: 1 }), // Restart
                },
            },
            connectionProvider: {
                get: () => {
                    return Promise.resolve(transports);
                },
            },
        });
    }

    public disconnect() {
        if (this.client) {
            this.client.stop();
            this.client = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}
