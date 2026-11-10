import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CrossChainMonitor } from '../CrossChainMonitor';
import { sha256PairHex, sha256TextHex } from '../../../services/bridge/relayerTracker';

describe('CrossChainMonitor (#1558)', () => {
  const leafHash = sha256TextHex('transfer-77:USDC:250');
  const sibling1 = sha256TextHex('sibling-level-1');
  const sibling2 = sha256TextHex('sibling-level-2');
  const parent1 = sha256PairHex(leafHash, sibling1);
  const validRoot = sha256PairHex(sibling2, parent1);

  it('renders step-by-step confirmation milestones, explorer links, and interactive Merkle node inspector', () => {
    render(
      <CrossChainMonitor
        transferId="TX-77"
        assetSymbol="USDC"
        amount="250"
        sourceTxHash="0xabc123sepolia"
        destinationTxHash="stellar_soroban_tx_88"
        leafHash={leafHash}
        siblings={[
          { position: 'right', siblingHash: sibling1 },
          { position: 'left', siblingHash: sibling2 },
        ]}
        expectedRootHash={validRoot}
      />
    );

    expect(screen.getByTestId('milestone-source_locked')).toHaveTextContent('12/12 confirmations');
    expect(screen.getByTestId('milestone-relayer_attested')).toHaveTextContent('5/5 confirmations');
    expect(screen.getByTestId('milestone-merkle_verified')).toHaveTextContent('completed');
    expect(screen.getByTestId('milestone-destination_minted')).toHaveTextContent('completed');

    expect(screen.getByTestId('source-explorer-link')).toHaveAttribute(
      'href',
      'https://sepolia.etherscan.io/tx/0xabc123sepolia'
    );
    expect(screen.getByTestId('dest-explorer-link')).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/stellar_soroban_tx_88'
    );

    expect(screen.getByTestId('merkle-proof-status')).toHaveTextContent('Verified Valid');
    expect(screen.getByTestId('merkle-node-inspector')).toHaveTextContent(parent1);

    fireEvent.click(screen.getByRole('button', { name: /Level 2 \(left\)/i }));
    expect(screen.getByTestId('merkle-node-inspector')).toHaveTextContent(sibling2);
    expect(screen.getByTestId('merkle-node-inspector')).toHaveTextContent(validRoot);
  });

  it('marks merkle_verified milestone failed and shows Invalid Proof when root hash mismatches', () => {
    render(
      <CrossChainMonitor
        transferId="TX-99"
        assetSymbol="XLM"
        amount="100"
        sourceTxHash="0xdef456"
        leafHash={leafHash}
        siblings={[{ position: 'right', siblingHash: sibling1 }]}
        expectedRootHash={'f'.repeat(64)}
      />
    );

    expect(screen.getByTestId('merkle-proof-status')).toHaveTextContent('Invalid Proof');
    expect(screen.getByTestId('milestone-merkle_verified')).toHaveTextContent('failed');
    expect(screen.queryByTestId('dest-explorer-link')).toBeNull();
  });
});
