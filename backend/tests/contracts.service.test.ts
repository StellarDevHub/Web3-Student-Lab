import { describe, expect, it } from '@jest/globals';
import { compileSmartContract, executeSmartContract } from '../src/services/contract.service.js';
import { compileWatToBase64, WAT_ADD, WAT_INFINITE_LOOP } from './fixtures/wasmFixtures.js';

const basicSource = `pragma solidity ^0.8.0;
contract HelloWorld {
  function execute() public pure returns (string memory) {
    return 'hello';
  }
}`;

describe('Contract Service', () => {
  it('should compile valid contract source successfully', async () => {
    const result = await compileSmartContract({
      sourceCode: basicSource,
      compilerVersion: '0.8.10',
      optimization: false,
      target: 'solidity',
      entryPoint: 'execute',
    });

    expect(result.compiled).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.abi[0]).toHaveProperty('name', 'execute');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should reject compilation for invalid source content', async () => {
    const result = await compileSmartContract({
      sourceCode: 'invalid source',
      compilerVersion: '0.8.10',
      optimization: false,
      target: 'solidity',
    });

    expect(result.compiled).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Contract source must include a valid contract or module declaration.')])
    );
  });

  it('should execute smart contract simulation and return metrics', async () => {
    const result = await executeSmartContract({
      contractAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      functionName: 'execute',
      parameters: [1, 'abc', true],
      gasLimit: 500000,
      caller: 'tester',
    });

    expect(result.success).toBe(true);
    expect(result.executionId).toBeDefined();
    expect(result.gasUsed).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.logs).toEqual(expect.arrayContaining([expect.stringContaining('Executed contract')]));
    expect(result.output).toHaveProperty('returnValue');
  });

  describe('sandboxed WASM execution (Issue #1420)', () => {
    it('routes wasmBase64 requests through the sandbox engine and returns the real result', async () => {
      const wasmBase64 = await compileWatToBase64(WAT_ADD);
      const result = await executeSmartContract({
        contractAddress: 'CSANDBOXWASMCONTRACTADDRESS000000000000000000000000000000',
        functionName: 'add',
        parameters: [4, 9],
        gasLimit: 1_000_000,
        wasmBase64,
      });

      expect(result.success).toBe(true);
      expect(result.output.returnValue).toBe(13);
      expect(result.gasUsed).toBeGreaterThan(0);
    }, 20_000);

    it('safely reports failure for a runaway WASM loop instead of hanging', async () => {
      const wasmBase64 = await compileWatToBase64(WAT_INFINITE_LOOP);
      const result = await executeSmartContract({
        contractAddress: 'CSANDBOXWASMCONTRACTADDRESS000000000000000000000000000000',
        functionName: 'run',
        gasLimit: 20_000,
        wasmBase64,
      });

      expect(result.success).toBe(false);
      expect(result.output.details).toMatchObject({ terminationReason: 'gas-exhausted' });
    }, 20_000);
  });
});
