/**
 * Smoke tests for hash / p2p / voting services.
 * Verifies modules resolve against the correct Prisma client path (`../db/index.js`).
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/db/index', () => ({
  __esModule: true,
  default: {
    hashSimulation: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'hash_smoke',
        ...args.data,
      })),
      findMany: jest.fn(async () => []),
    },
    p2PNode: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'node_smoke',
        ...args.data,
      })),
      findMany: jest.fn(async () => []),
    },
    p2PMessage: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'msg_smoke',
        ...args.data,
      })),
      findMany: jest.fn(async () => []),
    },
    idea: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'idea_smoke',
        ...args.data,
      })),
      findMany: jest.fn(async () => []),
    },
    vote: {
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => ({
        id: 'vote_smoke',
        ...args.create,
      })),
      findMany: jest.fn(async () => [{ value: 1 }, { value: -1 }]),
    },
  },
}));

import { HashService } from '../src/dashboard/hash.service.js';
import { P2PService } from '../src/infrastructure/p2p.service.js';
import { VotingService } from '../src/simulator/voting.service.js';

describe('hash/p2p/voting service smoke tests', () => {
  it('HashService loads and generates a hash via prisma index client', async () => {
    const result = await HashService.generateHash('student_smoke', 'payload', 'SHA-256');
    expect(result.hashType).toBe('SHA-256');
    expect(typeof result.hashValue).toBe('string');
    expect(result.hashValue.length).toBeGreaterThan(0);
  });

  it('P2PService loads and can add a node', async () => {
    const node = await P2PService.addNode('ws_smoke', 'Smoke Node');
    expect(node.nodeName).toBe('Smoke Node');
    expect(node.nodeId).toMatch(/^node-/);
  });

  it('VotingService loads and can score votes', async () => {
    const idea = await VotingService.createIdea('ws_smoke', 'student_smoke', 'Idea', 'Desc');
    expect(idea.title).toBe('Idea');

    const score = await VotingService.getIdeaScore('idea_smoke');
    expect(score).toBe(0);
  });
});
