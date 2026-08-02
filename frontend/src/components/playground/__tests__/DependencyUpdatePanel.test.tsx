import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DependencyUpdatePanel } from '../DependencyUpdatePanel';

const SAMPLE_TOML = '[dependencies]\nsoroban-sdk = "21.7.6"\n';

const CHECK_RESPONSE = {
  status: 'success',
  dependencies: [
    {
      name: 'soroban-sdk',
      currentVersion: '21.7.6',
      latestVersion: '22.0.7',
      isOutdated: true,
      updateType: 'major',
      releaseNotes: 'Protocol 22 support.',
    },
    {
      name: 'num-integer',
      currentVersion: '0.1.46',
      latestVersion: '0.1.46',
      isOutdated: false,
      updateType: 'none',
    },
  ],
  outdatedCount: 1,
  checkedAt: '2026-06-27T10:00:00.000Z',
  cargoTomlHash: 'abc123',
};

const UPDATE_RESPONSE = {
  status: 'success',
  updated: ['soroban-sdk'],
  failed: [],
  suggestedCargoToml: '[dependencies]\nsoroban-sdk = "22.0.7"\n',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DependencyUpdatePanel', () => {
  it('renders the panel heading', () => {
    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    expect(screen.getByText(/Dependency Updater/i)).toBeDefined();
  });

  it('renders the Check button', () => {
    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    expect(screen.getByRole('button', { name: /check dependencies/i })).toBeDefined();
  });

  it('shows outdated dependency after check', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => CHECK_RESPONSE,
    } as Response);

    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    fireEvent.click(screen.getByRole('button', { name: /check dependencies/i }));

    await waitFor(() => {
      expect(screen.getByText('soroban-sdk')).toBeDefined();
    });
    expect(screen.getByText('22.0.7')).toBeDefined();
  });

  it('shows up-to-date summary count', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => CHECK_RESPONSE,
    } as Response);

    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    fireEvent.click(screen.getByRole('button', { name: /check dependencies/i }));

    await waitFor(() => {
      expect(screen.getByText(/Up-to-date \(1\)/i)).toBeDefined();
    });
  });

  it('shows error message when check fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ status: 'error', message: 'Server error' }),
    } as Response);

    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    fireEvent.click(screen.getByRole('button', { name: /check dependencies/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Server error')).toBeDefined();
    });
  });

  it('shows updated confirmation after applying updates', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => CHECK_RESPONSE } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => UPDATE_RESPONSE } as Response);

    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} />);
    fireEvent.click(screen.getByRole('button', { name: /check dependencies/i }));

    await waitFor(() => screen.getByText('soroban-sdk'));

    // Select the dep and apply
    const checkbox = screen.getByRole('checkbox', { name: /select soroban-sdk/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /apply.*update/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 updated/i)).toBeDefined();
    });
  });

  it('calls onCargoTomlUpdate after copying updated Cargo.toml', async () => {
    const onUpdate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => CHECK_RESPONSE } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => UPDATE_RESPONSE } as Response);

    render(<DependencyUpdatePanel cargoToml={SAMPLE_TOML} onCargoTomlUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /check dependencies/i }));

    await waitFor(() => screen.getByText('soroban-sdk'));

    const checkbox = screen.getByRole('checkbox', { name: /select soroban-sdk/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /apply.*update/i }));

    await waitFor(() => screen.getByRole('button', { name: /copy updated cargo/i }));
    fireEvent.click(screen.getByRole('button', { name: /copy updated cargo/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(UPDATE_RESPONSE.suggestedCargoToml);
    });
  });
});
