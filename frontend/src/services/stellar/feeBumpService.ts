export interface RelayerSponsorConfig {
  sponsorAddress: string;
  maxSponsoredFeeStroops: number;
  remainingBudgetStroops: number;
}

export interface FeeBreakdown {
  mode: 'sponsored' | 'self-pay';
  sponsorAddress: string | null;
  innerFeeStroops: number;
  maxFeeLimitStroops: number;
  studentCostStroops: number;
  fallbackReason?: string;
}

export interface FeeBumpWrapResult {
  envelopeXdr: string;
  isFeeBumpWrapped: boolean;
  breakdown: FeeBreakdown;
}

export const DEFAULT_RELAYER_CONFIG: RelayerSponsorConfig = {
  sponsorAddress: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
  maxSponsoredFeeStroops: 10_000,
  remainingBudgetStroops: 500_000,
};

export function calculateFeeBreakdown(
  enabled: boolean,
  innerFeeStroops: number,
  studentBalanceXlm: number,
  relayer: RelayerSponsorConfig = DEFAULT_RELAYER_CONFIG
): FeeBreakdown {
  const requiredBumpFee = Math.max(innerFeeStroops * 2, 200);

  if (!enabled) {
    return {
      mode: 'self-pay',
      sponsorAddress: null,
      innerFeeStroops,
      maxFeeLimitStroops: innerFeeStroops,
      studentCostStroops: innerFeeStroops,
    };
  }

  if (relayer.remainingBudgetStroops < requiredBumpFee) {
    return {
      mode: 'self-pay',
      sponsorAddress: null,
      innerFeeStroops,
      maxFeeLimitStroops: innerFeeStroops,
      studentCostStroops: innerFeeStroops,
      fallbackReason:
        studentBalanceXlm <= 0
          ? 'Relayer sponsor budget exhausted and student has 0 XLM; fund via Friendbot or wait for budget refill.'
          : 'Relayer sponsor budget exhausted; falling back to student self-pay.',
    };
  }

  if (requiredBumpFee > relayer.maxSponsoredFeeStroops) {
    return {
      mode: 'self-pay',
      sponsorAddress: null,
      innerFeeStroops,
      maxFeeLimitStroops: innerFeeStroops,
      studentCostStroops: innerFeeStroops,
      fallbackReason: `Transaction fee (${requiredBumpFee} stroops) exceeds relayer max fee cap (${relayer.maxSponsoredFeeStroops} stroops).`,
    };
  }

  return {
    mode: 'sponsored',
    sponsorAddress: relayer.sponsorAddress,
    innerFeeStroops,
    maxFeeLimitStroops: Math.min(requiredBumpFee, relayer.maxSponsoredFeeStroops),
    studentCostStroops: 0,
  };
}

export function wrapWithFeeBumpEnvelope(
  signedInnerXdr: string,
  enabled: boolean,
  innerFeeStroops: number,
  studentBalanceXlm: number,
  relayer: RelayerSponsorConfig = DEFAULT_RELAYER_CONFIG
): FeeBumpWrapResult {
  if (!signedInnerXdr || !signedInnerXdr.trim()) {
    throw new Error('Signed inner transaction envelope XDR is required');
  }

  const breakdown = calculateFeeBreakdown(
    enabled,
    innerFeeStroops,
    studentBalanceXlm,
    relayer
  );

  if (breakdown.mode === 'self-pay') {
    return {
      envelopeXdr: signedInnerXdr,
      isFeeBumpWrapped: false,
      breakdown,
    };
  }

  const feeBumpPayload = JSON.stringify({
    type: 'ENVELOPE_TYPE_TX_FEE_BUMP',
    feeSource: breakdown.sponsorAddress,
    fee: breakdown.maxFeeLimitStroops,
    innerTxXdr: signedInnerXdr,
  });
  const encodedEnvelope = Buffer.from(feeBumpPayload, 'utf-8').toString('base64');

  return {
    envelopeXdr: encodedEnvelope,
    isFeeBumpWrapped: true,
    breakdown,
  };
}
