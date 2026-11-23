/**
 * Constant-product AMM maths for the yield calculator (Issue #1157).
 *
 * The calculator previously modelled a fixed APY the student typed in, which
 * teaches compound interest but nothing about being a liquidity provider. The
 * things that actually decide an LP's return — how reserves move, what
 * divergence costs versus simply holding, and how a large trade walks the price
 * — all fall out of the constant-product invariant `x · y = k`.
 *
 * Stellar exposes real pools two ways: classic AMM pools through Horizon's
 * `/liquidity_pools`, and Soroban pool contracts through RPC. Both reduce to a
 * pair of reserves, which is what this module works in.
 *
 * Pure functions only, so the maths is unit-testable without a network.
 */

export interface PoolReserves {
  /** Pool identifier — Horizon pool id or Soroban contract id. */
  id: string;
  assetA: string;
  assetB: string;
  /** Reserve of asset A, in whole units. */
  reserveA: number;
  /** Reserve of asset B, in whole units. */
  reserveB: number;
  /** Pool fee in basis points. Stellar classic AMM pools are 30 bps. */
  feeBps: number;
  /** Total pool shares outstanding, when the source reports them. */
  totalShares?: number;
}

/** Horizon `/liquidity_pools` record, trimmed to what this module reads. */
export interface RawLiquidityPool {
  id: string;
  fee_bp: number;
  total_shares: string;
  reserves: { asset: string; amount: string }[];
}

export const DEFAULT_FEE_BPS = 30;
export const BPS_DENOMINATOR = 10_000;

/** Investment horizons the calculator projects, in days. */
export const YIELD_HORIZON_DAYS = [30, 90, 365] as const;
export type YieldHorizon = (typeof YIELD_HORIZON_DAYS)[number];

function toNumber(value: string | number | undefined, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Horizon asset strings are `CODE:ISSUER`, or the literal `native`. */
export function assetCode(asset: string): string {
  if (!asset) return '';
  if (asset === 'native') return 'XLM';
  return asset.split(':')[0];
}

/** Normalise a Horizon liquidity pool record into `PoolReserves`. */
export function parseLiquidityPool(raw: RawLiquidityPool): PoolReserves {
  const [a, b] = raw?.reserves ?? [];

  return {
    id: raw?.id ?? '',
    assetA: assetCode(a?.asset ?? ''),
    assetB: assetCode(b?.asset ?? ''),
    reserveA: toNumber(a?.amount),
    reserveB: toNumber(b?.amount),
    feeBps: toNumber(raw?.fee_bp, DEFAULT_FEE_BPS),
    totalShares: toNumber(raw?.total_shares),
  };
}

/** The constant-product invariant, `k = x · y`. */
export function invariant(pool: PoolReserves): number {
  return pool.reserveA * pool.reserveB;
}

/**
 * Spot price of A in units of B.
 *
 * This is the marginal price at the current reserves — the price an
 * infinitesimally small trade would get, and therefore the best price
 * available. Every real trade does worse, which is what slippage measures.
 */
export function spotPrice(pool: PoolReserves): number {
  if (pool.reserveA === 0) return 0;
  return pool.reserveB / pool.reserveA;
}

export interface SwapQuote {
  /** Units of A paid in. */
  amountIn: number;
  /** Units of B received, after fee. */
  amountOut: number;
  /** Effective price paid, in B per A. */
  executionPrice: number;
  /** Fraction below spot the execution landed, 0–1. */
  slippage: number;
  /** Fee taken from the input, in units of A. */
  feePaid: number;
  /** Spot price after the trade moves the reserves. */
  priceAfter: number;
}

/**
 * Quote selling `amountIn` of asset A into the pool.
 *
 * Constant product with a fee on the input:
 *   `out = (in · (1 − fee) · reserveB) / (reserveA + in · (1 − fee))`
 *
 * The output is bounded by the reserve no matter how large the input, which is
 * the whole point of the curve — and why a big order against a thin pool is
 * punished so hard.
 */
export function quoteSwap(pool: PoolReserves, amountIn: number): SwapQuote {
  const spot = spotPrice(pool);

  if (amountIn <= 0 || pool.reserveA <= 0 || pool.reserveB <= 0) {
    return {
      amountIn: Math.max(0, amountIn),
      amountOut: 0,
      executionPrice: spot,
      slippage: 0,
      feePaid: 0,
      priceAfter: spot,
    };
  }

  const feeRate = pool.feeBps / BPS_DENOMINATOR;
  const feePaid = amountIn * feeRate;
  const amountInAfterFee = amountIn - feePaid;

  const amountOut =
    (amountInAfterFee * pool.reserveB) / (pool.reserveA + amountInAfterFee);

  const executionPrice = amountOut / amountIn;
  const slippage = spot === 0 ? 0 : Math.max(0, 1 - executionPrice / spot);

  const priceAfter = spotPrice({
    ...pool,
    reserveA: pool.reserveA + amountInAfterFee,
    reserveB: pool.reserveB - amountOut,
  });

  return { amountIn, amountOut, executionPrice, slippage, feePaid, priceAfter };
}

export interface DepthPoint {
  amountIn: number;
  amountOut: number;
  executionPrice: number;
  slippage: number;
}

/**
 * Sample the depth curve out to `maxFraction` of the A reserve.
 *
 * Plotted, this is the visual answer to "how big an order can this pool take?" —
 * it is close to flat while the trade is small relative to the reserves, then
 * bends away sharply.
 */
export function depthCurve(
  pool: PoolReserves,
  maxFraction = 0.5,
  steps = 24,
): DepthPoint[] {
  const points: DepthPoint[] = [];
  const maxIn = pool.reserveA * Math.max(0, maxFraction);

  for (let i = 1; i <= steps; i++) {
    const amountIn = (maxIn * i) / steps;
    const quote = quoteSwap(pool, amountIn);
    points.push({
      amountIn,
      amountOut: quote.amountOut,
      executionPrice: quote.executionPrice,
      slippage: quote.slippage,
    });
  }

  return points;
}

/**
 * Largest trade whose slippage stays within `maxSlippage`.
 *
 * Binary search over the curve — it is monotonic in trade size, so this
 * converges quickly and avoids sampling the curve at some arbitrary resolution.
 */
export function maxTradeWithinSlippage(
  pool: PoolReserves,
  maxSlippage: number,
  iterations = 40,
): number {
  if (maxSlippage <= 0 || pool.reserveA <= 0) return 0;

  let lo = 0;
  let hi = pool.reserveA * 10;

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (quoteSwap(pool, mid).slippage > maxSlippage) hi = mid;
    else lo = mid;
  }

  return lo;
}

/**
 * Impermanent loss at a price ratio of `priceRatio` versus the entry price.
 *
 * The closed form for a 50/50 constant-product pool:
 *   `IL = 2·√r / (1 + r) − 1`
 *
 * Always ≤ 0: rebalancing sells the winner on the way up and buys the loser on
 * the way down, so the pool always trails simply holding. It is "impermanent"
 * only because the price can come back — at `r = 1` the loss is exactly zero.
 */
export function impermanentLoss(priceRatio: number): number {
  if (priceRatio <= 0) return -1;
  return (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
}

export interface DivergencePoint {
  /** Price ratio versus entry, e.g. 1.5 = the asset rose 50%. */
  priceRatio: number;
  /** Impermanent loss as a fraction, ≤ 0. */
  loss: number;
  /** Value of the LP position, per unit of initial value. */
  lpValue: number;
  /** Value of simply holding the same two assets. */
  hodlValue: number;
}

/** Sample the IL curve so the UI can plot LP value against HODL value. */
export function divergenceCurve(ratios: number[]): DivergencePoint[] {
  return ratios.map((priceRatio) => {
    const loss = impermanentLoss(priceRatio);
    // Holding 50/50 into a price move of r leaves (1 + r)/2 per unit.
    const hodlValue = (1 + priceRatio) / 2;
    return { priceRatio, loss, lpValue: hodlValue * (1 + loss), hodlValue };
  });
}

/**
 * Fee APR from realised volume.
 *
 * `(volume · feeRate / liquidity) · (365 / windowDays)` — the pool's own trading
 * activity, annualised. This is the only part of an LP's return that is actually
 * earned rather than borrowed from price movement.
 */
export function feeApr(
  pool: PoolReserves,
  volumeInWindow: number,
  windowDays = 1,
): number {
  const liquidity = poolValueInB(pool);
  if (liquidity <= 0 || windowDays <= 0) return 0;

  const feeRate = pool.feeBps / BPS_DENOMINATOR;
  const periodsPerYear = 365 / windowDays;

  return ((volumeInWindow * feeRate) / liquidity) * periodsPerYear;
}

/** Total pool value denominated in asset B. */
export function poolValueInB(pool: PoolReserves): number {
  return pool.reserveB * 2;
}

/**
 * Compound a fee APR daily over a horizon.
 *
 * LP fees accrue into the reserves themselves, so they compound continuously in
 * practice; daily is a fair and legible approximation for a teaching tool.
 */
export function compoundedYield(apr: number, days: number): number {
  if (days <= 0) return 0;
  const daily = apr / 365;
  return Math.pow(1 + daily, days) - 1;
}

export interface HorizonProjection {
  days: YieldHorizon;
  /** Compounded return over the horizon, as a fraction. */
  yieldFraction: number;
  /** Value of `principal` at the end of the horizon. */
  finalValue: number;
  /** Fees earned over the horizon. */
  feesEarned: number;
}

/** Project a principal across the 30, 90 and 365-day horizons. */
export function projectHorizons(
  principal: number,
  apr: number,
  horizons: readonly YieldHorizon[] = YIELD_HORIZON_DAYS,
): HorizonProjection[] {
  return horizons.map((days) => {
    const yieldFraction = compoundedYield(apr, days);
    const feesEarned = principal * yieldFraction;
    return { days, yieldFraction, finalValue: principal + feesEarned, feesEarned };
  });
}

/**
 * Net LP outcome: fees earned less what divergence cost.
 *
 * The number that matters, and the one a fee APR quoted on its own hides — a
 * pool paying 20% while the pair diverges 40% is a losing position.
 */
export function netLpReturn(
  apr: number,
  days: number,
  priceRatio: number,
): { feeReturn: number; impermanentLoss: number; net: number } {
  const feeReturn = compoundedYield(apr, days);
  const loss = impermanentLoss(priceRatio);
  return { feeReturn, impermanentLoss: loss, net: feeReturn + loss };
}

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/** Horizon endpoint listing liquidity pools. */
export function liquidityPoolsUrl(horizonUrl: string, limit = 20): string {
  return `${horizonUrl.replace(/\/+$/, '')}/liquidity_pools?limit=${limit}&order=desc`;
}

/** Fetch live pools from Horizon and normalise them. */
export async function fetchLiquidityPools(
  horizonUrl: string = TESTNET_HORIZON_URL,
  init?: RequestInit,
): Promise<PoolReserves[]> {
  const response = await fetch(liquidityPoolsUrl(horizonUrl), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(`Horizon /liquidity_pools responded ${response.status}`);
  }

  const body = (await response.json()) as { _embedded?: { records?: RawLiquidityPool[] } };
  const records = body?._embedded?.records ?? [];

  // A pool with an empty side has no price and no depth; it would only render
  // as a divide-by-zero in every chart downstream.
  return records
    .map(parseLiquidityPool)
    .filter((pool) => pool.reserveA > 0 && pool.reserveB > 0);
}
