/**
 * Mempool & Gas Fee Auction — domain logic
 *
 * Educational model of an Ethereum-style fee market. Pending transactions sit in
 * a mempool and bid a priority fee (gwei per unit of gas). When a block is built,
 * the highest bidders are packed greedily until the block's gas limit is reached,
 * which is exactly the "auction" learners are meant to observe.
 *
 * Everything here is a pure function so it can be unit-tested and reused by both
 * the simulator hook and the visual components.
 */

export type TxType = 'TRANSFER' | 'SWAP' | 'MINT' | 'CONTRACT';

export interface PendingTx {
  id: string;
  /** Shortened pseudo address of the sender. */
  from: string;
  /** Operation kind — drives the gas estimate. */
  type: TxType;
  /** Gas units the transaction consumes when executed. */
  gasUnits: number;
  /** Priority fee bid in gwei per gas unit. The lever users tune. */
  feeBid: number;
  /** Epoch millis when the tx entered the pool — tiebreaker for equal bids. */
  addedAt: number;
}

export interface MinedBlock {
  /** Block height. */
  height: number;
  /** Transactions included, in execution order (highest bid first). */
  transactions: PendingTx[];
  /** Gas actually consumed by the included transactions. */
  gasUsed: number;
  /** Block gas ceiling at mining time. */
  gasLimit: number;
  /** Base fee (gwei) that bids had to clear to be eligible. */
  baseFee: number;
  /** Total priority fees paid to the validator, in gwei. */
  totalFees: number;
  minedAt: number;
}

/** Typical gas footprint per operation kind. */
export const GAS_BY_TYPE: Record<TxType, number> = {
  TRANSFER: 21_000,
  SWAP: 180_000,
  MINT: 90_000,
  CONTRACT: 250_000,
};

export const TX_TYPES: TxType[] = ['TRANSFER', 'SWAP', 'MINT', 'CONTRACT'];

/** Bounds for the fee-bid control, in gwei. */
export const MIN_FEE_BID = 1;
export const MAX_FEE_BID = 200;

/**
 * Priority fee a transaction pays the validator if mined, in gwei.
 * (priority bid above the base fee) × gas consumed.
 */
export function txPriorityFee(tx: PendingTx, baseFee: number): number {
  return Math.max(0, tx.feeBid - baseFee) * tx.gasUnits;
}

/**
 * Order the pool by the auction rule: highest bid wins, earliest arrival breaks
 * ties. Returns a new array; the input is left untouched.
 */
export function sortByFee(pool: PendingTx[]): PendingTx[] {
  return [...pool].sort((a, b) => b.feeBid - a.feeBid || a.addedAt - b.addedAt);
}

/**
 * Greedily select the transactions a validator would include: walk the pool from
 * the highest bid down, skipping anything that fails to clear the base fee or no
 * longer fits under the remaining gas. Mirrors a simple block builder.
 */
export function selectForBlock(
  pool: PendingTx[],
  gasLimit: number,
  baseFee: number,
): PendingTx[] {
  const included: PendingTx[] = [];
  let gasLeft = gasLimit;

  for (const tx of sortByFee(pool)) {
    if (tx.feeBid < baseFee) continue;
    if (tx.gasUnits > gasLeft) continue;
    included.push(tx);
    gasLeft -= tx.gasUnits;
  }

  return included;
}

let txCounter = 0;

/** Build a pseudo-random pending transaction for the simulated network. */
export function randomTx(now: number): PendingTx {
  const type = TX_TYPES[Math.floor(Math.random() * TX_TYPES.length)];
  const gasJitter = Math.floor((Math.random() - 0.5) * 10_000);
  txCounter += 1;

  return {
    id: `0x${(now.toString(16) + txCounter.toString(16)).slice(-10)}`,
    from: `0x${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
    type,
    gasUnits: Math.max(21_000, GAS_BY_TYPE[type] + gasJitter),
    feeBid: Math.floor(Math.random() * 60) + MIN_FEE_BID,
    addedAt: now,
  };
}

/** Sum the gas of a set of transactions. */
export function totalGas(txs: PendingTx[]): number {
  return txs.reduce((sum, tx) => sum + tx.gasUnits, 0);
}
