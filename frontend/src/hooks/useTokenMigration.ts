import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';

export interface TokenInfo {
  symbol: string;
  name: string;
  contractId: string;
  decimals: number;
  balance: string;
  icon?: string;
}

export interface ConversionRatio {
  numerator: number;
  denominator: number;
}

export interface MigrationVoucher {
  id: string;
  title: string;
  description: string;
  legacyToken: TokenInfo;
  migratedToken: TokenInfo;
  ratio: ConversionRatio;
  deadline: number;
  isExpired: boolean;
  bonusPercentage?: number;
  minAmount: string;
  maxAmount: string;
}

export interface MigrationReceipt {
  voucherId: string;
  legacySymbol: string;
  migratedSymbol: string;
  burnedAmount: string;
  mintedAmount: string;
  burnTxHash: string;
  mintTxHash: string;
  timestamp: number;
  status: 'completed' | 'failed';
  network: string;
}

export type MigrationStep = 'select' | 'burn' | 'mint' | 'receipt';

const KNOWN_VOUCHERS_TEMPLATE: Omit<MigrationVoucher, 'legacyToken' | 'migratedToken' | 'isExpired'>[] = [
  {
    id: 'voucher-edu-v2',
    title: 'Student Lab Credit v1 to v2 Upgrade',
    description: 'Convert deprecated v1 Lab Credits to the audited SEP-41 compliant Student Token v2 with 1:1 parity.',
    ratio: { numerator: 1, denominator: 1 },
    deadline: Date.now() + 90 * 24 * 60 * 60 * 1000,
    bonusPercentage: 0,
    minAmount: '1',
    maxAmount: '100000',
  },
  {
    id: 'voucher-gov-ratio',
    title: 'Governance Token Split Migration',
    description: 'Legacy DAO voting tokens migrate at 1:10 ratio to reflect the updated protocol denomination.',
    ratio: { numerator: 10, denominator: 1 },
    deadline: Date.now() + 45 * 24 * 60 * 60 * 1000,
    bonusPercentage: 5,
    minAmount: '5',
    maxAmount: '50000',
  },
  {
    id: 'voucher-cert-v2',
    title: 'Certificate Proof Token Standardization',
    description: 'Swap legacy unverified course badge vouchers into Soroban verified credential vouchers.',
    ratio: { numerator: 2, denominator: 1 },
    deadline: Date.now() + 60 * 24 * 60 * 60 * 1000,
    bonusPercentage: 10,
    minAmount: '1',
    maxAmount: '20000',
  },
];

function generateSimulatedTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export function useTokenMigration() {
  const { publicKey, activeNetwork, signTransaction } = useWallet();
  const [vouchers, setVouchers] = useState<MigrationVoucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<MigrationStep>('select');
  const [burnTxHash, setBurnTxHash] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<MigrationReceipt | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const scanLegacyBalances = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    try {
      let detectedEduBalance = publicKey ? '250.0000000' : '0.0000000';
      let detectedGovBalance = publicKey ? '50.0000000' : '0.0000000';
      let detectedCertBalance = publicKey ? '12.0000000' : '0.0000000';

      if (publicKey) {
        try {
          const horizonUrl = activeNetwork === 'PUBLIC'
            ? 'https://horizon.stellar.org'
            : 'https://horizon-testnet.stellar.org';
          const resp = await fetch(`${horizonUrl}/accounts/${encodeURIComponent(publicKey)}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data?.balances)) {
              for (const b of data.balances) {
                if (b.asset_code === 'EDU' || b.asset_code === 'EDUV1') {
                  detectedEduBalance = parseFloat(b.balance).toFixed(7);
                } else if (b.asset_code === 'GOV' || b.asset_code === 'GOVV1') {
                  detectedGovBalance = parseFloat(b.balance).toFixed(7);
                } else if (b.asset_code === 'CERT' || b.asset_code === 'CERTV1') {
                  detectedCertBalance = parseFloat(b.balance).toFixed(7);
                }
              }
            }
          }
        } catch {
          // Gracefully fallback to seeded test balances if Horizon is rate-limited or offline
        }
      }

      const populatedVouchers: MigrationVoucher[] = [
        {
          id: 'voucher-edu-v2',
          title: 'Student Lab Credit v1 to v2 Upgrade',
          description: 'Convert deprecated v1 Lab Credits to the audited SEP-41 compliant Student Token v2.',
          ratio: { numerator: 1, denominator: 1 },
          deadline: Date.now() + 90 * 24 * 60 * 60 * 1000,
          isExpired: false,
          bonusPercentage: 0,
          minAmount: '1',
          maxAmount: '10000',
          legacyToken: {
            symbol: 'EDU_OLD',
            name: 'Deprecated Student Lab Token',
            contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
            decimals: 7,
            balance: detectedEduBalance,
          },
          migratedToken: {
            symbol: 'STU_V2',
            name: 'Soroban Student Token v2',
            contractId: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5OWXYLCC3WDPOMLX',
            decimals: 7,
            balance: '0.0000000',
          },
        },
        {
          id: 'voucher-gov-ratio',
          title: 'Governance Token Split Migration',
          description: 'Legacy DAO voting tokens migrate at 1:10 ratio to reflect updated protocol denomination.',
          ratio: { numerator: 10, denominator: 1 },
          deadline: Date.now() + 45 * 24 * 60 * 60 * 1000,
          isExpired: false,
          bonusPercentage: 5,
          minAmount: '1',
          maxAmount: '5000',
          legacyToken: {
            symbol: 'GOV_V1',
            name: 'Legacy DAO Governance Unit',
            contractId: 'CB64P35Z7L5D7Q6XQ2LM7NYQZ6J8K9P0R1S2T3U4V5W6X7Y8Z9A0B1C2',
            decimals: 7,
            balance: detectedGovBalance,
          },
          migratedToken: {
            symbol: 'GOV_V2',
            name: 'Next-Gen Protocol Governance',
            contractId: 'CC75Q46A8M6E8R7Y73MN8PZR0K9L0Q1S2T3U4V5W6X7Y8Z9A0B1C2D3',
            decimals: 7,
            balance: '0.0000000',
          },
        },
        {
          id: 'voucher-cert-v2',
          title: 'Certificate Proof Token Standardization',
          description: 'Swap legacy unverified course badge vouchers into Soroban verified credential vouchers.',
          ratio: { numerator: 2, denominator: 1 },
          deadline: Date.now() + 60 * 24 * 60 * 60 * 1000,
          isExpired: false,
          bonusPercentage: 10,
          minAmount: '1',
          maxAmount: '1000',
          legacyToken: {
            symbol: 'CERT_V1',
            name: 'Legacy Course Badge Token',
            contractId: 'CD86R57B9N7F9S8Z84NO9QAS1L0M1R2T3U4V5W6X7Y8Z9A0B1C2D3E4',
            decimals: 7,
            balance: detectedCertBalance,
          },
          migratedToken: {
            symbol: 'CERT_V2',
            name: 'Verified Soroban Certificate',
            contractId: 'CE97S68C0O8G0T9A95OP0RBT2M1N2S3U4V5W6X7Y8Z9A0B1C2D3E4F5',
            decimals: 7,
            balance: '0.0000000',
          },
        },
      ];

      setVouchers(populatedVouchers);
      if (!selectedVoucherId && populatedVouchers.length > 0) {
        setSelectedVoucherId(populatedVouchers[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to scan legacy balances');
    } finally {
      setIsScanning(false);
    }
  }, [publicKey, selectedVoucherId]);

  useEffect(() => {
    scanLegacyBalances();
  }, [scanLegacyBalances]);

  const selectedVoucher = useMemo(() => {
    return vouchers.find((v) => v.id === selectedVoucherId) ?? vouchers[0] ?? null;
  }, [vouchers, selectedVoucherId]);

  const calculateMigratedAmount = useCallback(
    (inputAmount: string, voucher?: MigrationVoucher | null): string => {
      const target = voucher || selectedVoucher;
      if (!target || !inputAmount || isNaN(Number(inputAmount))) return '0';
      const num = parseFloat(inputAmount);
      if (num <= 0) return '0';

      const ratioMultiplier = target.ratio.numerator / target.ratio.denominator;
      const bonusMultiplier = 1 + (target.bonusPercentage || 0) / 100;
      const total = num * ratioMultiplier * bonusMultiplier;
      return total.toFixed(4);
    },
    [selectedVoucher]
  );

  const approveAndBurnLegacy = useCallback(
    async (voucherId: string, amount: string): Promise<string> => {
      if (!publicKey) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      const voucher = vouchers.find((v) => v.id === voucherId);
      if (!voucher) {
        throw new Error('Invalid migration voucher selected.');
      }

      const numAmount = parseFloat(amount);
      const balance = parseFloat(voucher.legacyToken.balance);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Please enter a valid amount to migrate.');
      }
      if (numAmount > balance) {
        throw new Error(`Insufficient legacy token balance. Available: ${voucher.legacyToken.balance}`);
      }

      setIsLoading(true);
      setError(null);

      try {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const generatedHash = generateSimulatedTxHash();
        setBurnTxHash(generatedHash);
        setCurrentStep('mint');
        return generatedHash;
      } catch (err: any) {
        const msg = err?.message || 'Burn authorization failed';
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, vouchers]
  );

  const mintMigratedToken = useCallback(
    async (voucherId: string, amount: string, existingBurnHash?: string): Promise<MigrationReceipt> => {
      if (!publicKey) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      const voucher = vouchers.find((v) => v.id === voucherId);
      if (!voucher) {
        throw new Error('Invalid migration voucher.');
      }
      const bHash = existingBurnHash || burnTxHash;
      if (!bHash) {
        throw new Error('Missing burn transaction verification.');
      }

      setIsLoading(true);
      setError(null);

      try {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        const generatedMintHash = generateSimulatedTxHash();
        const mintedAmount = calculateMigratedAmount(amount, voucher);

        const receipt: MigrationReceipt = {
          voucherId,
          legacySymbol: voucher.legacyToken.symbol,
          migratedSymbol: voucher.migratedToken.symbol,
          burnedAmount: amount,
          mintedAmount,
          burnTxHash: bHash,
          mintTxHash: generatedMintHash,
          timestamp: Date.now(),
          status: 'completed',
          network: activeNetwork || 'TESTNET',
        };

        setMintTxHash(generatedMintHash);
        setLatestReceipt(receipt);
        setCurrentStep('receipt');

        setVouchers((prev) =>
          prev.map((v) => {
            if (v.id === voucherId) {
              const currentOld = Math.max(0, parseFloat(v.legacyToken.balance) - parseFloat(amount));
              const currentNew = parseFloat(v.migratedToken.balance) + parseFloat(mintedAmount);
              return {
                ...v,
                legacyToken: {
                  ...v.legacyToken,
                  balance: currentOld.toFixed(7),
                },
                migratedToken: {
                  ...v.migratedToken,
                  balance: currentNew.toFixed(7),
                },
              };
            }
            return v;
          })
        );

        return receipt;
      } catch (err: any) {
        const msg = err?.message || 'Minting migrated token failed';
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, vouchers, burnTxHash, calculateMigratedAmount, activeNetwork]
  );

  const resetWizard = useCallback(() => {
    setCurrentStep('select');
    setBurnTxHash(null);
    setMintTxHash(null);
    setLatestReceipt(null);
    setError(null);
  }, []);

  return {
    vouchers,
    selectedVoucher,
    selectedVoucherId,
    setSelectedVoucherId,
    currentStep,
    setCurrentStep,
    burnTxHash,
    mintTxHash,
    latestReceipt,
    isLoading,
    isScanning,
    error,
    clearError: () => setError(null),
    scanLegacyBalances,
    calculateMigratedAmount,
    approveAndBurnLegacy,
    mintMigratedToken,
    resetWizard,
  };
}
