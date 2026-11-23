import { renderHook, act } from '@testing-library/react';
import { useTokenMigration } from '@/hooks/useTokenMigration';

jest.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    publicKey: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
    activeNetwork: 'TESTNET',
    signTransaction: jest.fn().mockResolvedValue('signed_xdr_payload'),
    connect: jest.fn(),
  }),
}));

describe('useTokenMigration Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should scan and populate legacy token migration vouchers', async () => {
    const { result } = renderHook(() => useTokenMigration());

    // Initially scanning
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(result.current.vouchers.length).toBeGreaterThan(0);
    expect(result.current.selectedVoucher).not.toBeNull();
    expect(result.current.selectedVoucher?.legacyToken.symbol).toBe('EDU_OLD');
    expect(parseFloat(result.current.selectedVoucher?.legacyToken.balance || '0')).toBeGreaterThan(0);
  });

  it('should calculate correct migrated amount based on conversion ratio', async () => {
    const { result } = renderHook(() => useTokenMigration());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    // 1:1 voucher
    const calculated = result.current.calculateMigratedAmount('50');
    expect(calculated).toBe('50.0000');
  });

  it('should execute two-step wizard: burn legacy then mint migrated token', async () => {
    const { result } = renderHook(() => useTokenMigration());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    const voucherId = result.current.selectedVoucher!.id;

    // Step 1: Approve & Burn
    await act(async () => {
      await result.current.approveAndBurnLegacy(voucherId, '25');
    });

    expect(result.current.currentStep).toBe('mint');
    expect(result.current.burnTxHash).toBeTruthy();

    // Step 2: Mint Migrated Token
    await act(async () => {
      await result.current.mintMigratedToken(voucherId, '25');
    });

    expect(result.current.currentStep).toBe('receipt');
    expect(result.current.mintTxHash).toBeTruthy();
    expect(result.current.latestReceipt).not.toBeNull();
    expect(result.current.latestReceipt?.burnedAmount).toBe('25');
    expect(result.current.latestReceipt?.burnTxHash).toBe(result.current.burnTxHash);
  });
});
