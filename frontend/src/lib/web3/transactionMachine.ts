import { assign, createMachine } from 'xstate';

export type Web3TransactionStatus =
  | 'idle'
  | 'detectingWallet'
  | 'connectingWallet'
  | 'connected'
  | 'switchingNetwork'
  | 'awaitingSignature'
  | 'submittingTransaction'
  | 'confirmed'
  | 'failed'
  | 'disconnected';

export interface Web3TransactionContext {
  walletName: string | null;
  publicKey: string | null;
  network: string;
  transactionXdr: string | null;
  signedTransactionXdr: string | null;
  transactionHash: string | null;
  error: string | null;
}

export type Web3TransactionEvent =
  | { type: 'DETECT_WALLET'; walletName: string }
  | { type: 'CONNECT_WALLET'; walletName: string }
  | { type: 'WALLET_CONNECTED'; walletName: string; publicKey: string }
  | { type: 'SWITCH_NETWORK'; network: string }
  | { type: 'NETWORK_SWITCHED'; network: string }
  | { type: 'REQUEST_SIGNATURE'; transactionXdr: string }
  | { type: 'SIGNATURE_APPROVED'; signedTransactionXdr: string }
  | { type: 'SUBMIT_TRANSACTION' }
  | { type: 'TRANSACTION_CONFIRMED'; transactionHash: string }
  | { type: 'DISCONNECT_WALLET' }
  | { type: 'RESET' }
  | { type: 'FAIL'; error: string };

const initialContext: Web3TransactionContext = {
  walletName: null,
  publicKey: null,
  network: 'TESTNET',
  transactionXdr: null,
  signedTransactionXdr: null,
  transactionHash: null,
  error: null,
};

const resetWalletContext = (): Partial<Web3TransactionContext> => ({
  walletName: null,
  publicKey: null,
  transactionXdr: null,
  signedTransactionXdr: null,
  transactionHash: null,
  error: null,
});

export const web3TransactionMachine = createMachine({
  id: 'web3Transaction',
  types: {} as {
    context: Web3TransactionContext;
    events: Web3TransactionEvent;
  },
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        DETECT_WALLET: {
          target: 'detectingWallet',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            error: null,
          })),
        },
        CONNECT_WALLET: {
          target: 'connectingWallet',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            error: null,
          })),
        },
      },
    },
    detectingWallet: {
      on: {
        CONNECT_WALLET: {
          target: 'connectingWallet',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            error: null,
          })),
        },
        FAIL: {
          target: 'failed',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
      },
    },
    connectingWallet: {
      on: {
        WALLET_CONNECTED: {
          target: 'connected',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            publicKey: event.publicKey,
            error: null,
          })),
        },
        FAIL: {
          target: 'failed',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
      },
    },
    connected: {
      on: {
        SWITCH_NETWORK: {
          target: 'switchingNetwork',
          actions: assign(({ event }) => ({
            network: event.network,
            error: null,
          })),
        },
        REQUEST_SIGNATURE: {
          target: 'awaitingSignature',
          actions: assign(({ event }) => ({
            transactionXdr: event.transactionXdr,
            signedTransactionXdr: null,
            transactionHash: null,
            error: null,
          })),
        },
        DISCONNECT_WALLET: {
          target: 'disconnected',
          actions: assign(resetWalletContext),
        },
      },
    },
    switchingNetwork: {
      on: {
        NETWORK_SWITCHED: {
          target: 'connected',
          actions: assign(({ event }) => ({
            network: event.network,
            error: null,
          })),
        },
        FAIL: {
          target: 'failed',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
      },
    },
    awaitingSignature: {
      on: {
        SIGNATURE_APPROVED: {
          target: 'submittingTransaction',
          actions: assign(({ event }) => ({
            signedTransactionXdr: event.signedTransactionXdr,
            error: null,
          })),
        },
        FAIL: {
          target: 'failed',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
      },
    },
    submittingTransaction: {
      on: {
        TRANSACTION_CONFIRMED: {
          target: 'confirmed',
          actions: assign(({ event }) => ({
            transactionHash: event.transactionHash,
            error: null,
          })),
        },
        FAIL: {
          target: 'failed',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
      },
    },
    confirmed: {
      on: {
        REQUEST_SIGNATURE: {
          target: 'awaitingSignature',
          actions: assign(({ event }) => ({
            transactionXdr: event.transactionXdr,
            signedTransactionXdr: null,
            transactionHash: null,
            error: null,
          })),
        },
        DISCONNECT_WALLET: {
          target: 'disconnected',
          actions: assign(resetWalletContext),
        },
        RESET: {
          target: 'connected',
          actions: assign({
            transactionXdr: null,
            signedTransactionXdr: null,
            transactionHash: null,
            error: null,
          }),
        },
      },
    },
    failed: {
      on: {
        CONNECT_WALLET: {
          target: 'connectingWallet',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            error: null,
          })),
        },
        REQUEST_SIGNATURE: {
          target: 'awaitingSignature',
          actions: assign(({ event }) => ({
            transactionXdr: event.transactionXdr,
            error: null,
          })),
        },
        DISCONNECT_WALLET: {
          target: 'disconnected',
          actions: assign(resetWalletContext),
        },
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
      },
    },
    disconnected: {
      on: {
        CONNECT_WALLET: {
          target: 'connectingWallet',
          actions: assign(({ event }) => ({
            walletName: event.walletName,
            error: null,
          })),
        },
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
      },
    },
  },
});

export const web3TransactionStateOrder: Web3TransactionStatus[] = [
  'idle',
  'detectingWallet',
  'connectingWallet',
  'connected',
  'switchingNetwork',
  'awaitingSignature',
  'submittingTransaction',
  'confirmed',
  'failed',
  'disconnected',
];

export function getWeb3TransactionStatus(value: unknown): Web3TransactionStatus {
  return typeof value === 'string' &&
    web3TransactionStateOrder.includes(value as Web3TransactionStatus)
    ? (value as Web3TransactionStatus)
    : 'idle';
}
