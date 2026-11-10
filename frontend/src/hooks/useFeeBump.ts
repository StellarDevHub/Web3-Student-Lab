import { useCallback, useMemo, useState } from 'react';
import {
  calculateFeeBreakdown,
  DEFAULT_RELAYER_CONFIG,
  FeeBreakdown,
  FeeBumpWrapResult,
  RelayerSponsorConfig,
  wrapWithFeeBumpEnvelope,
} from '../services/stellar/feeBumpService';

export interface UseFeeBumpOptions {
  studentBalanceXlm: number;
  innerFeeStroops?: number;
  relayerConfig?: RelayerSponsorConfig;
  defaultEnabled?: boolean;
}

export interface UseFeeBumpReturn {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isZeroBalanceStudent: boolean;
  breakdown: FeeBreakdown;
  prepareSubmissionEnvelope: (signedInnerXdr: string) => FeeBumpWrapResult;
}

export function useFeeBump({
  studentBalanceXlm,
  innerFeeStroops = 100,
  relayerConfig = DEFAULT_RELAYER_CONFIG,
  defaultEnabled,
}: UseFeeBumpOptions): UseFeeBumpReturn {
  const isZeroBalanceStudent = studentBalanceXlm <= 0;
  const [enabled, setEnabled] = useState<boolean>(
    defaultEnabled ?? isZeroBalanceStudent
  );

  const breakdown = useMemo(
    () =>
      calculateFeeBreakdown(
        enabled,
        innerFeeStroops,
        studentBalanceXlm,
        relayerConfig
      ),
    [enabled, innerFeeStroops, studentBalanceXlm, relayerConfig]
  );

  const prepareSubmissionEnvelope = useCallback(
    (signedInnerXdr: string) =>
      wrapWithFeeBumpEnvelope(
        signedInnerXdr,
        enabled,
        innerFeeStroops,
        studentBalanceXlm,
        relayerConfig
      ),
    [enabled, innerFeeStroops, studentBalanceXlm, relayerConfig]
  );

  return {
    enabled,
    setEnabled,
    isZeroBalanceStudent,
    breakdown,
    prepareSubmissionEnvelope,
  };
}
