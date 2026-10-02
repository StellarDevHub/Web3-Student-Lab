import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe('merkle-simulator redirect (FE-HARD-27)', () => {
  it('redirects the duplicate route to the unified studio', async () => {
    const { redirect } = await import('next/navigation');
    const { default: MerkleSimulatorRedirect } = await import('../page');

    expect(() => MerkleSimulatorRedirect()).toThrow('NEXT_REDIRECT:/merkle-tree');
    expect(redirect).toHaveBeenCalledWith('/merkle-tree');
  });
});
