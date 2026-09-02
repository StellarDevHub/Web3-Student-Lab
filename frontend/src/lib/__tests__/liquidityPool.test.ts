import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  DEFAULT_FEE_BPS,
  assetCode,
  compoundedYield,
  depthCurve,
  divergenceCurve,
  feeApr,
  fetchLiquidityPools,
  impermanentLoss,
  invariant,
  liquidityPoolsUrl,
  maxTradeWithinSlippage,
  netLpReturn,
  parseLiquidityPool,
  poolValueInB,
  projectHorizons,
  quoteSwap,
  spotPrice,
  type PoolReserves,
  type RawLiquidityPool,
} from '@/lib/liquidityPool';

function pool(overrides: Partial<PoolReserves> = {}): PoolReserves {
  return {
    id: 'pool_1',
    assetA: 'XLM',
    assetB: 'USDC',
    reserveA: 1_000_000,
    reserveB: 100_000,
    feeBps: DEFAULT_FEE_BPS,
    totalShares: 316_227,
    ...overrides,
  };
}

describe('assetCode', () => {
  it('maps native to XLM', () => {
    expect(assetCode('native')).toBe('XLM');
  });

  it('takes the code from CODE:ISSUER', () => {
    expect(assetCode('USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')).toBe('USDC');
  });

  it('handles an empty asset', () => {
    expect(assetCode('')).toBe('');
  });
});

describe('parseLiquidityPool', () => {
  const raw: RawLiquidityPool = {
    id: 'abc123',
    fee_bp: 30,
    total_shares: '5000',
    reserves: [
      { asset: 'native', amount: '1000.5' },
      { asset: 'USDC:GISSUER', amount: '250.25' },
    ],
  };

  it('converts Horizon strings into numbers', () => {
    const parsed = parseLiquidityPool(raw);

    expect(parsed.assetA).toBe('XLM');
    expect(parsed.assetB).toBe('USDC');
    expect(parsed.reserveA).toBeCloseTo(1000.5, 6);
    expect(parsed.reserveB).toBeCloseTo(250.25, 6);
    expect(parsed.feeBps).toBe(30);
  });

  it('defaults the fee to 30 bps when absent', () => {
    const { fee_bp: _omitted, ...rest } = raw;
    expect(parseLiquidityPool(rest as RawLiquidityPool).feeBps).toBe(DEFAULT_FEE_BPS);
  });

  it('survives a record with no reserves', () => {
    const parsed = parseLiquidityPool({ id: 'x', fee_bp: 30, total_shares: '0', reserves: [] });

    expect(parsed.reserveA).toBe(0);
    expect(parsed.reserveB).toBe(0);
  });
});

describe('invariant and spot price', () => {
  it('computes k = x · y', () => {
    expect(invariant(pool())).toBe(1_000_000 * 100_000);
  });

  it('prices A in units of B', () => {
    expect(spotPrice(pool())).toBeCloseTo(0.1, 10);
  });

  it('returns 0 rather than dividing by an empty reserve', () => {
    expect(spotPrice(pool({ reserveA: 0 }))).toBe(0);
  });
});

describe('quoteSwap', () => {
  it('charges the pool fee on the input', () => {
    const quote = quoteSwap(pool(), 1000);

    expect(quote.feePaid).toBeCloseTo(3, 6); // 30 bps of 1000
  });

  it('executes below spot — every real trade does', () => {
    const p = pool();
    const quote = quoteSwap(p, 1000);

    expect(quote.executionPrice).toBeLessThan(spotPrice(p));
    expect(quote.slippage).toBeGreaterThan(0);
  });

  it('slips harder as the trade grows relative to the reserves', () => {
    const p = pool();

    expect(quoteSwap(p, 100_000).slippage).toBeGreaterThan(quoteSwap(p, 1_000).slippage);
  });

  it('punishes the same trade far more in a thin pool', () => {
    const deep = quoteSwap(pool(), 10_000);
    const thin = quoteSwap(pool({ reserveA: 20_000, reserveB: 2_000 }), 10_000);

    expect(thin.slippage).toBeGreaterThan(deep.slippage);
  });

  it('never drains the output reserve, however large the input', () => {
    const p = pool();
    const quote = quoteSwap(p, 10_000_000_000);

    expect(quote.amountOut).toBeLessThan(p.reserveB);
  });

  it('moves the price against the trader', () => {
    const p = pool();
    const quote = quoteSwap(p, 50_000);

    // Selling A into the pool makes A cheaper in terms of B.
    expect(quote.priceAfter).toBeLessThan(spotPrice(p));
  });

  it('returns a zero quote for a non-positive input', () => {
    expect(quoteSwap(pool(), 0).amountOut).toBe(0);
    expect(quoteSwap(pool(), -5).amountOut).toBe(0);
  });

  it('returns a zero quote against an empty pool', () => {
    expect(quoteSwap(pool({ reserveA: 0, reserveB: 0 }), 100).amountOut).toBe(0);
  });

  it('preserves the invariant net of fees', () => {
    const p = pool();
    const quote = quoteSwap(p, 5_000);
    const kAfter = (p.reserveA + quote.amountIn - quote.feePaid) * (p.reserveB - quote.amountOut);

    expect(kAfter).toBeCloseTo(invariant(p), 0);
  });
});

describe('depthCurve', () => {
  it('samples the requested number of steps', () => {
    expect(depthCurve(pool(), 0.5, 10)).toHaveLength(10);
  });

  it('slips monotonically more with size', () => {
    const curve = depthCurve(pool(), 0.5, 12);

    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].slippage).toBeGreaterThanOrEqual(curve[i - 1].slippage);
    }
  });

  it('returns less favourable execution as size grows', () => {
    const curve = depthCurve(pool(), 0.5, 12);

    expect(curve[curve.length - 1].executionPrice).toBeLessThan(curve[0].executionPrice);
  });
});

describe('maxTradeWithinSlippage', () => {
  it('finds a trade that lands within the budget', () => {
    const p = pool();
    const size = maxTradeWithinSlippage(p, 0.01);

    expect(quoteSwap(p, size).slippage).toBeLessThanOrEqual(0.0101);
  });

  it('allows a bigger trade in a deeper pool', () => {
    const deep = maxTradeWithinSlippage(pool(), 0.01);
    const thin = maxTradeWithinSlippage(pool({ reserveA: 10_000, reserveB: 1_000 }), 0.01);

    expect(deep).toBeGreaterThan(thin);
  });

  it('returns 0 for a zero slippage budget', () => {
    expect(maxTradeWithinSlippage(pool(), 0)).toBe(0);
  });
});

describe('impermanentLoss', () => {
  it('is zero when the price comes back to where it started', () => {
    expect(impermanentLoss(1)).toBeCloseTo(0, 12);
  });

  it('matches the known 2x figure of about 5.7%', () => {
    expect(impermanentLoss(2)).toBeCloseTo(-0.0572, 4);
  });

  it('matches the known 4x figure of exactly 20%', () => {
    expect(impermanentLoss(4)).toBeCloseTo(-0.2, 6);
  });

  it('is symmetric between a doubling and a halving', () => {
    expect(impermanentLoss(2)).toBeCloseTo(impermanentLoss(0.5), 10);
  });

  it('is never positive — an LP always trails holding', () => {
    for (const ratio of [0.1, 0.25, 0.5, 1, 2, 4, 10]) {
      expect(impermanentLoss(ratio)).toBeLessThanOrEqual(0);
    }
  });

  it('bottoms out at total loss for a price of zero', () => {
    expect(impermanentLoss(0)).toBe(-1);
  });
});

describe('divergenceCurve', () => {
  it('leaves the LP below HODL everywhere except parity', () => {
    const curve = divergenceCurve([0.5, 1, 2, 4]);

    for (const point of curve) {
      if (point.priceRatio === 1) expect(point.lpValue).toBeCloseTo(point.hodlValue, 10);
      else expect(point.lpValue).toBeLessThan(point.hodlValue);
    }
  });
});

describe('feeApr', () => {
  it('annualises realised volume against pool liquidity', () => {
    // 100k daily volume, 30 bps, 200k liquidity → 300/200000 × 365
    expect(feeApr(pool(), 100_000, 1)).toBeCloseTo((300 / 200_000) * 365, 8);
  });

  it('scales with volume', () => {
    expect(feeApr(pool(), 200_000, 1)).toBeCloseTo(feeApr(pool(), 100_000, 1) * 2, 8);
  });

  it('falls as the pool deepens', () => {
    const deep = feeApr(pool({ reserveA: 10_000_000, reserveB: 1_000_000 }), 100_000, 1);

    expect(deep).toBeLessThan(feeApr(pool(), 100_000, 1));
  });

  it('is zero for an empty pool or window', () => {
    expect(feeApr(pool({ reserveB: 0 }), 100_000, 1)).toBe(0);
    expect(feeApr(pool(), 100_000, 0)).toBe(0);
  });
});

describe('poolValueInB', () => {
  it('counts both sides at the current price', () => {
    expect(poolValueInB(pool())).toBe(200_000);
  });
});

describe('compoundedYield', () => {
  it('is zero over no time', () => {
    expect(compoundedYield(0.2, 0)).toBe(0);
  });

  it('exceeds the simple rate over a year, because it compounds', () => {
    expect(compoundedYield(0.2, 365)).toBeGreaterThan(0.2);
  });

  it('grows with the horizon', () => {
    expect(compoundedYield(0.2, 365)).toBeGreaterThan(compoundedYield(0.2, 90));
    expect(compoundedYield(0.2, 90)).toBeGreaterThan(compoundedYield(0.2, 30));
  });
});

describe('projectHorizons', () => {
  it('projects 30, 90 and 365 days by default', () => {
    const projections = projectHorizons(10_000, 0.2);

    expect(projections.map((p) => p.days)).toEqual([30, 90, 365]);
  });

  it('grows the principal by the compounded fraction', () => {
    const [thirty] = projectHorizons(10_000, 0.2);

    expect(thirty.finalValue).toBeCloseTo(10_000 + thirty.feesEarned, 8);
    expect(thirty.feesEarned).toBeGreaterThan(0);
  });
});

describe('netLpReturn', () => {
  it('nets fees against divergence', () => {
    const result = netLpReturn(0.2, 365, 2);

    expect(result.impermanentLoss).toBeLessThan(0);
    expect(result.net).toBeCloseTo(result.feeReturn + result.impermanentLoss, 10);
  });

  it('is negative when divergence outruns the fees', () => {
    // 5% APR against a 4x move, whose IL is 20%.
    expect(netLpReturn(0.05, 30, 4).net).toBeLessThan(0);
  });

  it('is just the fee return when the price does not move', () => {
    const result = netLpReturn(0.2, 90, 1);

    expect(result.net).toBeCloseTo(result.feeReturn, 10);
  });
});

describe('liquidityPoolsUrl', () => {
  it('builds the endpoint with a limit', () => {
    expect(liquidityPoolsUrl('https://horizon-testnet.stellar.org', 5)).toBe(
      'https://horizon-testnet.stellar.org/liquidity_pools?limit=5&order=desc',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(liquidityPoolsUrl('https://horizon-testnet.stellar.org/', 5)).toContain(
      'stellar.org/liquidity_pools',
    );
  });
});

describe('fetchLiquidityPools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses and returns live pools', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            _embedded: {
              records: [
                {
                  id: 'p1',
                  fee_bp: 30,
                  total_shares: '100',
                  reserves: [
                    { asset: 'native', amount: '500' },
                    { asset: 'USDC:GX', amount: '50' },
                  ],
                },
              ],
            },
          }),
      }),
    );

    const pools = await fetchLiquidityPools();

    expect(pools).toHaveLength(1);
    expect(pools[0].assetA).toBe('XLM');
    expect(pools[0].reserveA).toBe(500);
  });

  it('drops pools with an empty side', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            _embedded: {
              records: [
                {
                  id: 'empty',
                  fee_bp: 30,
                  total_shares: '0',
                  reserves: [
                    { asset: 'native', amount: '0' },
                    { asset: 'USDC:GX', amount: '0' },
                  ],
                },
              ],
            },
          }),
      }),
    );

    expect(await fetchLiquidityPools()).toHaveLength(0);
  });

  it('throws with the status when Horizon rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchLiquidityPools()).rejects.toThrow(/500/);
  });
});
