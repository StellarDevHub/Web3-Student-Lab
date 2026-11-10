import { describe, expect, it } from 'vitest';
import {
  computeCharacterDiff,
  computeCodeDiff,
  revertDiffChunk,
} from '@/utils/diffHighlighter';

describe('diffHighlighter', () => {
  it('computes character-level additions and deletions accurately', () => {
    const original = 'pub fn increment(env: Env, step: u32) -> u32';
    const modified = 'pub fn increment(env: Env, delta: u64) -> u64';

    const spans = computeCharacterDiff(original, modified);
    const deletedText = spans
      .filter((s) => s.op === -1)
      .map((s) => s.text)
      .join('');
    const insertedText = spans
      .filter((s) => s.op === 1)
      .map((s) => s.text)
      .join('');

    expect(deletedText).toContain('step');
    expect(insertedText).toContain('delta');
    expect(spans[0]).toEqual({ op: 0, text: 'pub fn increment(env: Env, ' });
  });

  it('produces line chunks, unified diff output, and supports reverting individual chunks', () => {
    const starterContract = [
      '#![no_std]',
      'use soroban_sdk::{contract, contractimpl, Env};',
      '',
      'pub fn version() -> u32 {',
      '    1',
      '}',
      '',
      'pub fn owner() -> u32 {',
      '    100',
      '}',
    ].join('\n');

    const modifiedContract = [
      '#![no_std]',
      'use soroban_sdk::{contract, contractimpl, Env};',
      '',
      'pub fn version() -> u32 {',
      '    2',
      '}',
      '',
      'pub fn owner() -> u32 {',
      '    999',
      '}',
    ].join('\n');

    const diff = computeCodeDiff(starterContract, modifiedContract);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(2);
    expect(diff.unifiedDiff).toContain('-     1');
    expect(diff.unifiedDiff).toContain('+     2');

    const changedChunks = diff.chunks.filter((chunk) => chunk.hasChanges);
    expect(changedChunks).toHaveLength(2);

    // Revert only the first changed chunk (version 2 -> 1), keeping owner 999
    const reverted = revertDiffChunk(diff.chunks, changedChunks[0].id);
    expect(reverted).toContain('pub fn version() -> u32 {\n    1\n}');
    expect(reverted).toContain('pub fn owner() -> u32 {\n    999\n}');
  });
});
