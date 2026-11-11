import { useMemo, useState } from 'react';
import {
  buildDestinationExplorerUrl,
  buildSourceExplorerUrl,
  CrossChainTransferState,
  MerkleProofNode,
  verifyMerkleInclusionProof,
} from '../services/bridge/relayerTracker';

export interface UseBridgeStatusInput {
  transferId: string;
  assetSymbol: string;
  amount: string;
  sourceTxHash: string;
  destinationTxHash?: string;
  leafHash: string;
  siblings: Array<{ position: 'left' | 'right'; siblingHash: string }>;
  expectedRootHash: string;
}

export function useBridgeStatus(input: UseBridgeStatusInput) {
  const [selectedNodeLevel, setSelectedNodeLevel] = useState<number>(1);

  const state: CrossChainTransferState = useMemo(() => {
    const merkleProof = verifyMerkleInclusionProof(
      input.leafHash,
      input.siblings,
      input.expectedRootHash
    );
    const hasDest = Boolean(input.destinationTxHash);

    return {
      transferId: input.transferId,
      assetSymbol: input.assetSymbol,
      amount: input.amount,
      sourceTxHash: input.sourceTxHash,
      destinationTxHash: input.destinationTxHash,
      sourceExplorerUrl: buildSourceExplorerUrl(input.sourceTxHash),
      destinationExplorerUrl: input.destinationTxHash
        ? buildDestinationExplorerUrl(input.destinationTxHash)
        : null,
      milestones: [
        {
          id: 'source_locked',
          label: 'Asset Locked on Ethereum Sepolia',
          chain: 'Ethereum Sepolia',
          status: 'completed',
          txHash: input.sourceTxHash,
          explorerUrl: buildSourceExplorerUrl(input.sourceTxHash),
          confirmations: 12,
          requiredConfirmations: 12,
        },
        {
          id: 'relayer_attested',
          label: 'Relayer Quorum Attestation',
          chain: 'Bridge Relayer',
          status: 'completed',
          confirmations: 5,
          requiredConfirmations: 5,
        },
        {
          id: 'merkle_verified',
          label: 'Merkle Inclusion Proof Verified',
          chain: 'Bridge Relayer',
          status: merkleProof.verified ? 'completed' : 'failed',
          confirmations: merkleProof.verified ? 1 : 0,
          requiredConfirmations: 1,
        },
        {
          id: 'destination_minted',
          label: 'Wrapped Asset Minted on Stellar Soroban',
          chain: 'Stellar Soroban',
          status: hasDest ? 'completed' : 'in_progress',
          txHash: input.destinationTxHash,
          explorerUrl: input.destinationTxHash
            ? buildDestinationExplorerUrl(input.destinationTxHash)
            : undefined,
          confirmations: hasDest ? 1 : 0,
          requiredConfirmations: 1,
        },
      ],
      merkleProof,
    };
  }, [input]);

  const activeNode: MerkleProofNode | null =
    state.merkleProof.nodes.find((n) => n.level === selectedNodeLevel) ??
    state.merkleProof.nodes[0] ??
    null;

  return {
    state,
    selectedNodeLevel,
    setSelectedNodeLevel,
    activeNode,
  };
}
