import type { BridgeTransaction } from './types';

export function getDevelopmentBridgeTransactions(): BridgeTransaction[] {
  return [
    {
      id: 'local-sep24-completed',
      sourceChain: 'Circle test anchor',
      targetChain: 'Stellar',
      amount: '100.00',
      asset: 'USDC',
      sender: 'External account',
      recipient: 'GBX...123',
      status: 'completed',
      timestamp: new Date(Date.now() - 3600000),
      sourceTxHash: 'stellar_tx_hash_001',
      targetTxHash: '0xabcdef123456789',
      serviceName: 'Local fixture',
      protocol: 'sep24',
      rawStatus: 'completed',
    },
    {
      id: 'local-sep6-pending',
      sourceChain: 'Stellar',
      targetChain: 'Test bridge',
      amount: '0.5',
      asset: 'ETH',
      sender: 'GDX...456',
      recipient: '0x1234...5678',
      status: 'on_chain',
      timestamp: new Date(Date.now() - 1800000),
      sourceTxHash: '0x123456789abcdef',
      estimatedCompletion: new Date(Date.now() + 900000),
      serviceName: 'Local fixture',
      protocol: 'sep6',
      rawStatus: 'pending_external',
    },
  ];
}
