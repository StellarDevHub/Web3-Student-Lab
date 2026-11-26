import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  BLACKLIST_TTL_SECONDS,
  GasStationError,
  GasStationService,
  RelayerSubmissionQueue,
} from '../src/services/gasStationService.js';

// In-memory Redis mock supporting get, set (with EX/NX), del, decr, and eval for Lua scripts
class InMemoryRedis {
  private store = new Map<string, { value: string; ttl?: number }>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    const hasNx = args.includes('NX');
    if (hasNx && this.store.has(key)) {
      return null;
    }
    const exIdx = args.indexOf('EX');
    const ttl = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
    this.store.set(key, { value: String(value), ttl });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async decr(key: string): Promise<number> {
    const cur = parseInt(this.store.get(key)?.value || '0', 10) - 1;
    this.store.set(key, { value: String(cur), ttl: this.store.get(key)?.ttl });
    return cur;
  }

  async decrby(key: string, amount: number): Promise<number> {
    const cur = parseInt(this.store.get(key)?.value || '0', 10) - amount;
    this.store.set(key, { value: String(cur), ttl: this.store.get(key)?.ttl });
    return cur;
  }

  async eval(script: string, _numKeys: number, key: string, ...argv: any[]): Promise<number> {
    if (script.includes('INCRBY')) {
      // reserveGasQuota script
      const used = parseInt(this.store.get(key)?.value || '0', 10);
      const amount = Number(argv[0]);
      const limit = Number(argv[1]);
      const ttl = Number(argv[2]);
      if (used + amount > limit) return -1;
      const total = used + amount;
      this.store.set(key, { value: String(total), ttl });
      return total;
    }
    if (script.includes('local limit = tonumber(ARGV[1])')) {
      // RESERVE_TX_CAP_SCRIPT
      const count = parseInt(this.store.get(key)?.value || '0', 10);
      const limit = Number(argv[0]);
      const ttl = Number(argv[1]);
      if (count + 1 > limit) return -1;
      const total = count + 1;
      this.store.set(key, { value: String(total), ttl });
      return total;
    }
    // RECORD_ABUSE_SCRIPT
    const count = parseInt(this.store.get(key)?.value || '0', 10) + 1;
    const ttl = Number(argv[0]);
    this.store.set(key, { value: String(count), ttl });
    return count;
  }

  getTtl(key: string): number | undefined {
    return this.store.get(key)?.ttl;
  }

  clear(): void {
    this.store.clear();
  }
}

const mockRedis = new InMemoryRedis();

jest.mock('../src/utils/redis.js', () => ({
  getRedisClient: () => mockRedis,
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const WHITELISTED_CONTRACT = Address.contract(Buffer.alloc(32, 1)).toString();
const UNAUTHORIZED_CONTRACT = Address.contract(Buffer.alloc(32, 2)).toString();

function buildContractTx(
  signer: Keypair,
  contractId: string,
  fnName: string,
  sequence = '100',
  sign = true
): string {
  const account = new Account(signer.publicKey(), sequence);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(fnName))
    .setTimeout(30)
    .build();
  if (sign) {
    tx.sign(signer);
  }
  return tx.toXDR();
}

function buildPaymentTx(signer: Keypair, destination: string, sequence = '100'): string {
  const account = new Account(signer.publicKey(), sequence);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: '10',
      })
    )
    .setTimeout(30)
    .build();
  tx.sign(signer);
  return tx.toXDR();
}

describe('GasStationService (BE-091 anti-drain, caps, geofencing & Turnstile)', () => {
  const studentKeypair = Keypair.random();
  const relayerKeypair = Keypair.random();
  let mockSigner: any;
  let mockHorizon: any;
  let queue: RelayerSubmissionQueue;

  beforeEach(() => {
    mockRedis.clear();
    mockSigner = {
      getPublicKey: () => relayerKeypair.publicKey(),
      signTransaction: jest.fn().mockResolvedValue(undefined),
    };
    mockHorizon = {
      submitTransaction: jest.fn().mockResolvedValue({ hash: 'tx-hash-123', ledger: 42 }),
    };
    queue = new RelayerSubmissionQueue(async (_key, _ttl, fn) => fn());
  });

  it('sponsors a valid whitelisted course contract invocation', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
    });
    const xdrStr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson');

    const result = await service.sponsor({
      studentId: 'student-1',
      studentPublicKey: studentKeypair.publicKey(),
      innerTxXdr: xdrStr,
    });

    expect(result.hash).toBe('tx-hash-123');
    expect(result.ledger).toBe(42);
    expect(mockHorizon.submitTransaction).toHaveBeenCalledTimes(1);
    const usage = await service.getDailyTxCount('student-1');
    expect(usage.used).toBe(1);
    expect(usage.limit).toBe(50);
  });

  it('strictly rejects unauthorized contracts', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
    });
    const xdrStr = buildContractTx(studentKeypair, UNAUTHORIZED_CONTRACT, 'submit_lesson');

    await expect(
      service.sponsor({
        studentId: 'student-1',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: xdrStr,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('not a verified course contract'),
    });
    expect(mockHorizon.submitTransaction).not.toHaveBeenCalled();
  });

  it('strictly rejects arbitrary fund transfers (native payment and contract transfer)', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
    });

    // 1. Native Stellar payment operation
    const paymentXdr = buildPaymentTx(studentKeypair, Keypair.random().publicKey());
    await expect(
      service.sponsor({
        studentId: 'student-1',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: paymentXdr,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('payment is not eligible for sponsorship'),
    });

    // 2. Soroban token transfer function on a contract
    const transferXdr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'transfer');
    await expect(
      service.sponsor({
        studentId: 'student-1',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: transferXdr,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('arbitrary fund transfers are prohibited'),
    });
  });

  it('enforces the daily cap of 50 sponsored transactions per student', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
      dailyTxCap: 2,
      abuseThreshold: 100,
    });

    for (let i = 0; i < 2; i++) {
      const xdrStr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson', String(100 + i));
      await service.sponsor({
        studentId: 'student-cap',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: xdrStr,
      });
    }

    const thirdXdr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson', '103');
    await expect(
      service.sponsor({
        studentId: 'student-cap',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: thirdXdr,
      })
    ).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining('Daily limit of 2 sponsored transactions reached'),
    });
  });

  it('mandates Turnstile CAPTCHA verification for unlinked wallets', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
      turnstileSecretKey: 'test-secret',
      fetchFn: mockFetch as any,
    });

    const xdrStr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson');

    // Missing token -> rejected
    await expect(
      service.sponsor({
        studentId: 'student-unlinked',
        studentPublicKey: '',
        innerTxXdr: xdrStr,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Turnstile CAPTCHA verification is required'),
    });

    // Valid token -> succeeds
    const result = await service.sponsor({
      studentId: 'student-unlinked',
      studentPublicKey: '',
      innerTxXdr: xdrStr,
      turnstileToken: 'valid-turnstile-token',
      clientIp: '203.0.113.10',
    });

    expect(result.hash).toBe('tx-hash-123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('automatically blacklists abusive addresses in Redis for 24 hours', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
      abuseThreshold: 3,
      blacklistTtlSeconds: BLACKLIST_TTL_SECONDS,
    });

    const badXdr = buildContractTx(studentKeypair, UNAUTHORIZED_CONTRACT, 'drain');

    for (let i = 0; i < 3; i++) {
      await expect(
        service.sponsor({
          studentId: 'attacker-1',
          studentPublicKey: studentKeypair.publicKey(),
          innerTxXdr: badXdr,
        })
      ).rejects.toBeInstanceOf(GasStationError);
    }

    // Address should now be blacklisted in Redis with 24h TTL
    const isBlacklisted = await service.isAddressBlacklisted(studentKeypair.publicKey());
    expect(isBlacklisted).toBe(true);
    expect(mockRedis.getTtl(`gas-station:blacklist:${studentKeypair.publicKey()}`)).toBe(86400);

    // Even a valid transaction from this address is now immediately blocked
    const validXdr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson', '200');
    await expect(
      service.sponsor({
        studentId: 'attacker-1',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: validXdr,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('blacklisted for 24 hours'),
    });
  });

  it('enforces geofencing for blocked countries', async () => {
    const service = new GasStationService(mockSigner, queue, mockHorizon, {
      whitelistedContracts: [WHITELISTED_CONTRACT],
      blockedCountries: ['KP', 'IR'],
    });
    const xdrStr = buildContractTx(studentKeypair, WHITELISTED_CONTRACT, 'submit_lesson');

    await expect(
      service.sponsor({
        studentId: 'student-geo',
        studentPublicKey: studentKeypair.publicKey(),
        innerTxXdr: xdrStr,
        countryCode: 'kp',
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('not available in your region'),
    });
  });
});
