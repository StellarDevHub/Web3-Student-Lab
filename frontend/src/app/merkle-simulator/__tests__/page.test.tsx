import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MerkleSimulatorPage from '../page';

// Same fixtures the contract-derived library tests pin (see lib/merkle tests).
const ADDRESS_2 = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const LEAF_0 = 'f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82';
// 5 sample claims, the last one has amount 2500 (not the vector's i128::MAX) so
// the root is whatever the page computes — assert on shape, not a constant.

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

async function renderPage() {
  const utils = render(<MerkleSimulatorPage />);
  await screen.findByTestId('merkle-root');
  return utils;
}

function nodeVerdict(container: HTMLElement, id: string): string | null {
  return container.querySelector(`[data-node-id="${id}"]`)?.getAttribute('data-verdict') ?? null;
}

describe('merkle-simulator airdrop proof explorer (FE-081)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    stubMatchMedia(true); // skip the staged animation unless a test opts in
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the contract-scheme tree from the claim list and draws it', async () => {
    const { container } = await renderPage();

    expect(
      screen.getByRole('heading', { name: /airdrop merkle proof explorer/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('merkle-root').textContent).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByText(/depth 3 · 5 claims/i)).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /airdrop merkle tree visualization/i })
    ).toBeInTheDocument();
    // 5 leaves + 3 + 2 + 1 (odd nodes are promoted, so each level is drawn).
    expect(container.querySelectorAll('circle').length).toBe(11);
  });

  it('links to the general Proof Studio', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: /merkle proof studio/i })).toHaveAttribute(
      'href',
      '/merkle-tree'
    );
  });

  it('inspects the leaf hash and its three fields when a leaf is selected', async () => {
    await renderPage();
    expect(screen.queryByLabelText('Leaf inspector')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));

    const inspector = await screen.findByLabelText('Leaf inspector');
    expect(within(inspector).getByText(LEAF_0)).toBeInTheDocument();
    expect(within(inspector).getByText('00000000')).toBeInTheDocument();
    expect(within(inspector).getByText('000000000000000000000000000001f4')).toBeInTheDocument();
  });

  it('finds an address and offers to inspect its claim; flags a non-member', async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText('Your address'), { target: { value: ADDRESS_2 } });
    const found = await screen.findByRole('button', { name: /inspect claim #2/i });
    fireEvent.click(found);
    expect(await screen.findByLabelText('Leaf inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Index')).toHaveValue('2');

    fireEvent.change(screen.getByLabelText('Your address'), {
      target: { value: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI' },
    });
    expect(await screen.findByText(/not in this airdrop/i)).toBeInTheDocument();
  });

  it('verifies an honest claim: every step and the root turn green and the contract accepts', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    fireEvent.click(await screen.findByRole('button', { name: /verify claim/i }));

    const verdict = await screen.findByTestId('verdict');
    expect(verdict).toHaveAttribute('data-valid', 'true');
    expect(verdict).toHaveTextContent(/accepted/i);

    expect(screen.getByTestId('leaf-step')).toHaveAttribute('data-match', 'true');
    const steps = screen.getAllByTestId('proof-step');
    expect(steps).toHaveLength(3);
    steps.forEach((step) => expect(step).toHaveAttribute('data-match', 'true'));

    // Path L0-0 → L1-0 → L2-0 → L3-0 is green; the siblings are not coloured.
    ['L0-0', 'L1-0', 'L2-0', 'L3-0'].forEach((id) =>
      expect(nodeVerdict(container, id)).toBe('match')
    );
    expect(nodeVerdict(container, 'L0-1')).toBe('none');
  });

  it('turns the path red and reports InvalidProof (#404) when the amount is inflated', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '501' } });
    fireEvent.click(screen.getByRole('button', { name: /verify claim/i }));

    const verdict = await screen.findByTestId('verdict');
    expect(verdict).toHaveAttribute('data-valid', 'false');
    expect(verdict).toHaveTextContent(/#404\) InvalidProof/);

    expect(screen.getByTestId('leaf-step')).toHaveAttribute('data-match', 'false');
    screen
      .getAllByTestId('proof-step')
      .forEach((step) => expect(step).toHaveAttribute('data-match', 'false'));
    ['L0-0', 'L1-0', 'L2-0', 'L3-0'].forEach((id) =>
      expect(nodeVerdict(container, id)).toBe('mismatch')
    );
  });

  it('shows where a corrupted sibling hash breaks an otherwise honest path', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');

    fireEvent.click(screen.getByLabelText(/corrupt the first sibling hash/i));
    fireEvent.click(screen.getByRole('button', { name: /verify claim/i }));

    await screen.findByTestId('verdict');
    // The leaf itself is right; the corrupted sibling makes step 1 and everything above wrong.
    expect(screen.getByTestId('leaf-step')).toHaveAttribute('data-match', 'true');
    expect(nodeVerdict(container, 'L0-0')).toBe('match');
    expect(nodeVerdict(container, 'L1-0')).toBe('mismatch');
    expect(nodeVerdict(container, 'L3-0')).toBe('mismatch');
    expect(screen.getByTestId('verdict')).toHaveAttribute('data-valid', 'false');
  });

  it('reports ZeroAmount (#407) without hashing, like the contract', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /verify claim/i }));

    expect(await screen.findByTestId('verdict')).toHaveTextContent(/#407\) ZeroAmount/);
    expect(screen.queryAllByTestId('proof-step')).toHaveLength(0);
  });

  it('refuses to verify a malformed claim and says why', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'nope' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid stellar address/i);
    expect(screen.getByRole('button', { name: /verify claim/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /reset to honest claim/i }));
    expect(screen.getByRole('button', { name: /verify claim/i })).toBeEnabled();
  });

  it('formats the claim for Soroban submission: CLI command and JSON with ScVal XDR', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');

    const call = screen.getByLabelText('Contract call');
    expect(call).toHaveTextContent(
      'claim_airdrop --index 0 --account GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF --amount 500'
    );
    expect(call).toHaveTextContent('--id <CONTRACT_ID>');
    expect(call).toHaveTextContent(/"scVals"/);
    expect(call).toHaveTextContent(/"proof": \[/);

    fireEvent.change(screen.getByLabelText(/contract id/i), {
      target: { value: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM' },
    });
    expect(call).toHaveTextContent('--id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
  });

  it('reports bad claim lines and blocks building when none are valid', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Airdrop claims'), {
      target: { value: 'not-an-address, 5\nstill wrong' },
    });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(/line 1: not a valid stellar address/i);
    expect(alerts[0]).toHaveTextContent(/line 2/i);
    expect(screen.getByRole('button', { name: /build tree/i })).toBeDisabled();
  });

  it('rebuilds when the claims change', async () => {
    await renderPage();
    const before = screen.getByTestId('merkle-root').textContent;

    fireEvent.change(screen.getByLabelText('Airdrop claims'), {
      target: {
        value: `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF, 500\n${ADDRESS_2}, 9`,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /build tree/i }));

    await screen.findByText(/depth 1 · 2 claims/i);
    expect(screen.getByTestId('merkle-root').textContent).not.toBe(before);
  });

  it('steps through the verification one stage at a time when motion is allowed', async () => {
    stubMatchMedia(false);
    await renderPage();
    // Leaf 4 is the promoted node: a one-step proof keeps the animation short.
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 4' }));
    await screen.findByLabelText('Leaf inspector');
    fireEvent.click(screen.getByRole('button', { name: /verify claim/i }));

    // Nothing is revealed up front…
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /skip animation/i })).toBeInTheDocument()
    );
    expect(screen.queryByTestId('verdict')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('proof-step')).toHaveLength(0);

    // …then the leaf, then the step, then the verdict.
    await screen.findByTestId('leaf-step', undefined, { timeout: 3000 });
    expect(screen.queryByTestId('verdict')).not.toBeInTheDocument();
    await screen.findByTestId('proof-step', undefined, { timeout: 3000 });
    expect(await screen.findByTestId('verdict', undefined, { timeout: 3000 })).toHaveAttribute(
      'data-valid',
      'true'
    );
  }, 15000);

  it('can skip the animation', async () => {
    stubMatchMedia(false);
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Select leaf 0' }));
    await screen.findByLabelText('Leaf inspector');
    fireEvent.click(screen.getByRole('button', { name: /verify claim/i }));

    fireEvent.click(await screen.findByRole('button', { name: /skip animation/i }));
    expect(await screen.findByTestId('verdict')).toHaveAttribute('data-valid', 'true');
    expect(screen.getAllByTestId('proof-step')).toHaveLength(3);
  });
});
