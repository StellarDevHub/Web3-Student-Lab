import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signTransaction = vi.fn();

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    publicKey: SOURCE,
    isConnected: true,
    signTransaction,
  }),
}));

import BatchComposer from '../BatchComposer';

// Real, valid strkey values: the builder validates addresses before they reach
// XDR, so placeholder text would fail for the wrong reason.
const SOURCE = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const DEST = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const TOKEN = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';

const addOperation = (kind: string) => {
  fireEvent.change(screen.getByLabelText('Add operation', { selector: 'select' }), {
    target: { value: kind },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add operation to batch' }));
};

/** The operation rows, which are the list items carrying reorder buttons. */
const rows = () =>
  screen
    .getAllByRole('button', { name: /remove operation/i })
    .map((button) => button.closest('li') as HTMLElement);

const fill = (row: HTMLElement, label: string, value: string) => {
  fireEvent.change(within(row).getByLabelText(label, { selector: 'input' }), {
    target: { value },
  });
};

const ACCOUNT_RESPONSE = { sequence: '42' };

/**
 * Answers both calls the component makes: the account lookup and the submit.
 * Ordering matters only for the submit test, which asserts on call 2.
 */
const mockFetchOk = () =>
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).includes('/accounts/')) {
      return { ok: true, status: 200, json: async () => ACCOUNT_RESPONSE } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => '' } as unknown as Response;
  });

const completePayment = (row: HTMLElement) => {
  fill(row, 'Destination', DEST);
  fill(row, 'Amount', '10');
};

const completeManageData = (row: HTMLElement) => {
  fill(row, 'Name', 'config');
};

beforeEach(() => {
  signTransaction.mockReset();
  signTransaction.mockResolvedValue('signed-envelope-xdr');
  vi.stubGlobal('fetch', vi.fn());
  mockFetchOk();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BatchComposer', () => {
  it('renders the panel heading', () => {
    render(<BatchComposer />);
    expect(screen.getByText(/Batch Composer/i)).toBeDefined();
  });

  it('starts empty with guidance instead of a bare form', () => {
    render(<BatchComposer />);
    expect(screen.getByText(/No operations yet/i)).toBeDefined();
  });

  it('adds one row per added operation', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');
    expect(rows()).toHaveLength(2);
  });

  it('labels each row with its operation type', () => {
    render(<BatchComposer />);
    addOperation('approve');
    addOperation('transfer');
    expect(within(rows()[0]).getByText('Token approval')).toBeDefined();
    expect(within(rows()[1]).getByText('Token transfer')).toBeDefined();
  });

  it('reorders operations so a later row can move to the front', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    expect(within(rows()[0]).getByText('Payment')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Move operation 2 up' }));

    expect(within(rows()[0]).getByText('Manage data')).toBeDefined();
    expect(within(rows()[1]).getByText('Payment')).toBeDefined();
  });

  it('disables moving the first operation up and the last down', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    expect(screen.getByRole('button', { name: 'Move operation 1 up' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('button', { name: 'Move operation 2 down' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('button', { name: 'Move operation 2 up' })).toHaveProperty(
      'disabled',
      false
    );
  });

  it('removes the targeted operation', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    fireEvent.click(screen.getByRole('button', { name: 'Remove operation 1' }));

    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText('Manage data')).toBeDefined();
  });

  it('flags a missing field without discarding the other rows', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    expect(within(rows()[0]).getByText('Payment needs a destination')).toBeDefined();
    // Each row surfaces its first problem inline; later ones appear on submit.
    expect(within(rows()[0]).queryByText(/^Payment needs an amount$/)).toBeNull();
    expect(within(rows()[1]).getByText('Data entry needs a name')).toBeDefined();
  });

  it('clears the warning once the field is filled', () => {
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);
    expect(within(rows()[0]).queryByText(/needs/i)).toBeNull();
  });

  it('treats an empty data value as a delete rather than an error', () => {
    render(<BatchComposer />);
    addOperation('manageData');
    completeManageData(rows()[0]);
    expect(within(rows()[0]).queryByText(/needs/i)).toBeNull();
  });

  it('asks for token fields on an approval row', () => {
    render(<BatchComposer />);
    addOperation('approve');
    expect(within(rows()[0]).getByLabelText('Token contract')).toBeDefined();
    expect(within(rows()[0]).getByLabelText('Spender')).toBeDefined();
    expect(within(rows()[0]).getByLabelText('Amount (stroops)')).toBeDefined();
  });

  it('asks for a recipient on a transfer row', () => {
    render(<BatchComposer />);
    addOperation('transfer');
    expect(within(rows()[0]).getByLabelText('Recipient')).toBeDefined();
  });

  it('shows the total fee as base fee multiplied by operation count', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');
    addOperation('payment');
    expect(screen.getByText(/total fee 300 stroops/i)).toBeDefined();
  });

  it('states that one signature covers the whole batch', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');
    expect(screen.getAllByText(/one signature/i).length).toBeGreaterThan(0);
  });

  it('reports nothing applied when the batch fails at the first operation', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');
    expect(screen.getByText(/nothing in this 2-operation batch is applied/i)).toBeDefined();
  });

  it('describes earlier operations as discarded, not individually rolled back', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    fireEvent.change(screen.getByLabelText('Simulate failure at operation'), {
      target: { value: '1' },
    });

    expect(screen.getByText(/discarded with the rest of the envelope/i)).toBeDefined();
    expect(screen.queryByText(/rolled back/i)).toBeNull();
  });

  it('marks operations after the failure as never reached', () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');

    fireEvent.change(screen.getByLabelText('Simulate failure at operation'), {
      target: { value: '0' },
    });

    expect(screen.getByText(/never reached/i)).toBeDefined();
  });

  it('asks for exactly one signature for a multi-operation batch', async () => {
    render(<BatchComposer />);
    addOperation('payment');
    addOperation('manageData');
    completePayment(rows()[0]);
    completeManageData(rows()[1]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(signTransaction).toHaveBeenCalledTimes(1));
    const [envelope, opts] = signTransaction.mock.calls[0];
    expect(typeof envelope).toBe('string');
    expect(envelope.length).toBeGreaterThan(0);
    expect(opts.networkPassphrase).toBe('Test SDF Network ; September 2015');
  });

  it('submits the signed envelope exactly once', async () => {
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Batch applied/i));
    // Two calls: the account lookup for the sequence, then one submit.
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(String(url)).toMatch(/horizon-testnet\.stellar\.org\/transactions$/);
    expect(String(init?.body)).toContain('signed-envelope-xdr');
  });

  it('keeps the batch on testnet by default', async () => {
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('horizon-testnet');
  });

  it('reports that nothing was applied when the wallet rejects', async () => {
    signTransaction.mockRejectedValueOnce(new Error('User declined'));
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/nothing was applied/i)
    );
    // Only the sequence lookup happened; nothing was submitted.
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/transactions'))).toBe(
      false
    );
  });

  it('reports a rejected submission as applying nothing', async () => {
    mockFetchOk();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/accounts/')) {
        return { ok: true, status: 200, json: async () => ACCOUNT_RESPONSE } as unknown as Response;
      }
      return { ok: false, status: 400, text: async () => 'tx_bad_seq' } as unknown as Response;
    });
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/nothing was applied/i)
    );
  });

  it('does not prompt the wallet when a row is incomplete', () => {
    render(<BatchComposer />);
    addOperation('payment');

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('disables submission until at least one operation exists', () => {
    render(<BatchComposer />);
    expect(screen.getByRole('button', { name: /sign and submit/i })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('rejects a fractional token amount before prompting the wallet', async () => {
    render(<BatchComposer />);
    addOperation('transfer');
    const row = rows()[0];
    fill(row, 'Token contract', TOKEN);
    fill(row, 'Recipient', DEST);
    fill(row, 'Amount (stroops)', '2.5');

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/whole number of stroops/i)
    );
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('signs against the sequence read from Horizon, not a hardcoded one', async () => {
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(signTransaction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(`/accounts/${SOURCE}`);
  });

  it('prefers an explicitly supplied sequence over the Horizon lookup', async () => {
    render(<BatchComposer sequence="7" />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(signTransaction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/accounts/'))).toBe(
      false
    );
  });

  it('does not submit when the sequence lookup fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);
    render(<BatchComposer />);
    addOperation('payment');
    completePayment(rows()[0]);

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Could not read the account sequence/i)
    );
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid address before prompting the wallet', async () => {
    render(<BatchComposer />);
    addOperation('payment');
    fill(rows()[0], 'Destination', 'not-an-address');
    fill(rows()[0], 'Amount', '10');

    fireEvent.click(screen.getByRole('button', { name: /sign and submit/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/invalid/i));
    expect(signTransaction).not.toHaveBeenCalled();
  });
});
