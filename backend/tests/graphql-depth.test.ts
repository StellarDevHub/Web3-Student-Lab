import { describe, expect, it } from '@jest/globals';
import { buildSchema, parse, validate } from 'graphql';
import { depthLimitRule } from '../src/graphql/validationRules.js';

/**
 * Query depth limiting tests (#1424 / BE-HARD-33): nested queries are capped
 * at depth 6.
 */

const schema = buildSchema(`
  type Query { a: A }
  type A { b: B }
  type B { c: C }
  type C { d: D }
  type D { e: E }
  type E { name: String, f: F }
  type F { g: String }
`);

const runDepthRule = (query: string, maxDepth = 6) =>
  validate(schema, parse(query), [depthLimitRule(() => maxDepth)]);

describe('GraphQL depth limiting (#1424)', () => {
  it('allows a query at the maximum depth of 6', () => {
    // a -> b -> c -> d -> e -> name  (depth 6)
    const query = '{ a { b { c { d { e { name } } } } } }';
    expect(runDepthRule(query)).toHaveLength(0);
  });

  it('rejects a query deeper than 6 with DEPTH_LIMIT_EXCEEDED', () => {
    // a -> b -> c -> d -> e -> f -> g  (depth 7)
    const query = '{ a { b { c { d { e { f { g } } } } } } }';
    const errors = runDepthRule(query);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.extensions.code).toBe('DEPTH_LIMIT_EXCEEDED');
    expect(errors[0]?.message).toMatch(/maximum depth of 6/);
  });

  it('honours a custom max depth', () => {
    const query = '{ a { b { c { d { e { name } } } } } }'; // depth 6
    expect(runDepthRule(query, 6)).toHaveLength(0);
    expect(runDepthRule(query, 5)).toHaveLength(1);
  });
});
