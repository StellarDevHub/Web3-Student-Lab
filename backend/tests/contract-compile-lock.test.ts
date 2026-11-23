import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/lib/lock/index.js', () => ({
  lockManager: {
    compileLockKey: (id: string) => `compile:${id}`,
    withLock: jest.fn((_key: string, _options: unknown, fn: () => Promise<unknown>) => fn()),
  },
}));

import { lockManager } from '../src/lib/lock/index.js';
import { compileSmartContract } from '../src/services/contract.service.js';

const withLockMock = lockManager.withLock as unknown as {
  mockClear: () => void;
  mock: { calls: unknown[][] };
};

const basicSource = `pragma solidity ^0.8.0;
contract HelloWorld {
  function execute() public pure returns (string memory) {
    return 'hello';
  }
}`;

describe('compile execution lock (#1419)', () => {
  beforeEach(() => {
    withLockMock.mockClear();
  });

  it('compiles under a per-project distributed lock', async () => {
    const result = await compileSmartContract({
      sourceCode: basicSource,
      compilerVersion: '0.8.10',
      optimization: false,
      target: 'solidity',
      entryPoint: 'execute',
      projectId: 'proj-42',
    });

    expect(result.compiled).toBe(true);
    expect(withLockMock.mock.calls).toHaveLength(1);
    expect(withLockMock.mock.calls[0]?.[0]).toBe('compile:proj-42');
  });

  it('falls back to the source hash when no project id is supplied', async () => {
    await compileSmartContract({
      sourceCode: basicSource,
      compilerVersion: '0.8.10',
      optimization: false,
      target: 'solidity',
    });

    const key = String(withLockMock.mock.calls[0]?.[0]);
    expect(key).toMatch(/^compile:[0-9a-f]{64}$/);
  });
});
