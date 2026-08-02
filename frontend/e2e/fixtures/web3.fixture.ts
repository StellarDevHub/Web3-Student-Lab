import { test as base, expect, type BrowserContext } from '@playwright/test';

const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MOCK_STELLAR_ADDRESS = 'GCMOCKWALLETADDRESS000000000000000000000000000000000000000000000';
const MOCK_ETHEREUM_ADDRESS = '0x1111111111111111111111111111111111111111';

type Web3Mocks = {
  stellarAddress: string;
  ethereumAddress: string;
  signedTransactionXdr: string;
  installWalletMocks: () => Promise<void>;
  installWebSocketMock: () => Promise<void>;
};

export const test = base.extend<Web3Mocks>({
  stellarAddress: async ({}, use) => {
    await use(MOCK_STELLAR_ADDRESS);
  },
  ethereumAddress: async ({}, use) => {
    await use(MOCK_ETHEREUM_ADDRESS);
  },
  signedTransactionXdr: async ({}, use) => {
    await use('AAAAAgAAAAA-web3-student-lab-signed-xdr');
  },
  installWalletMocks: async ({ context, stellarAddress, ethereumAddress, signedTransactionXdr }, use) => {
    await installWalletMocks(context, {
      stellarAddress,
      ethereumAddress,
      signedTransactionXdr,
    });
    await use(async () => undefined);
  },
  installWebSocketMock: async ({ context }, use) => {
    await installWebSocketMock(context);
    await use(async () => undefined);
  },
});

export { expect };

async function installWalletMocks(
  context: BrowserContext,
  options: {
    stellarAddress: string;
    ethereumAddress: string;
    signedTransactionXdr: string;
  }
) {
  await context.addInitScript(
    ({ stellarAddress, ethereumAddress, signedTransactionXdr, networkPassphrase }) => {
      const freighterApi = {
        isConnected: async () => ({ isConnected: true }),
        requestAccess: async () => ({ address: stellarAddress }),
        getAddress: async () => ({ address: stellarAddress }),
        getNetwork: async () => ({ network: 'TESTNET', networkPassphrase }),
        getNetworkDetails: async () => ({
          network: 'TESTNET',
          networkUrl: 'https://horizon-testnet.stellar.org',
          networkPassphrase,
          sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        }),
        signTransaction: async (xdr: string) => ({
          signedTxXdr: `${signedTransactionXdr}:${xdr.length}`,
          signerAddress: stellarAddress,
        }),
      };

      Object.defineProperty(window, 'freighterApi', {
        configurable: true,
        value: freighterApi,
      });
      Object.defineProperty(window, 'freighter', {
        configurable: true,
        value: freighterApi,
      });
      Object.defineProperty(window, 'stellar', {
        configurable: true,
        value: { freighter: freighterApi },
      });

      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        value: {
          isMetaMask: true,
          selectedAddress: ethereumAddress,
          request: async ({ method }: { method: string; params?: unknown[] }) => {
            if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
              return [ethereumAddress];
            }
            if (method === 'personal_sign') {
              return '0xmocked_personal_signature';
            }
            if (method === 'eth_chainId') {
              return '0xaa36a7';
            }
            return null;
          },
          on: () => undefined,
          removeListener: () => undefined,
        },
      });

      Object.defineProperty(window, 'albedo', {
        configurable: true,
        value: {
          publicKey: async () => ({ pubkey: stellarAddress }),
          tx: async ({ xdr }: { xdr: string; network: string }) => ({
            signed_envelope_xdr: `${signedTransactionXdr}:albedo:${xdr.length}`,
          }),
        },
      });
    },
    {
      stellarAddress: options.stellarAddress,
      ethereumAddress: options.ethereumAddress,
      signedTransactionXdr: options.signedTransactionXdr,
      networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
    }
  );
}

async function installWebSocketMock(context: BrowserContext) {
  await context.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url: string;
      readonly protocol = '';
      readonly extensions = '';
      binaryType: BinaryType = 'blob';
      bufferedAmount = 0;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        const payload = typeof data === 'string' ? data : '[binary]';
        window.setTimeout(() => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({ type: 'ack', payload }),
          });
          this.dispatchEvent(event);
          this.onmessage?.(event);
        }, 0);
      }

      close(code = 1000, reason = 'mock closed') {
        this.readyState = MockWebSocket.CLOSED;
        const event = new CloseEvent('close', { code, reason, wasClean: true });
        this.dispatchEvent(event);
        this.onclose?.(event);
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: MockWebSocket,
    });
  });
}
