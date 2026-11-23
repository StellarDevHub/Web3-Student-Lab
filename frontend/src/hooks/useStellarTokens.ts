'use client';

import { useCallback } from 'react';
import { Address, Contract, rpc, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { getPublicEnv } from '@/lib/env';
import { NETWORK_PASSPHRASES } from '@/contexts/WalletContext';
import { useWallet } from '@/contexts/WalletContext';

export interface TokenAllowance {
  balance: bigint;
  allowance: bigint;
}

/** SEP-41 balance and allowance reads plus a single-envelope subscription call. */
export function useStellarTokens() {
  const { publicKey, activeNetwork, signTransaction } = useWallet();

  const inspect = useCallback(async (tokenId: string, spender: string): Promise<TokenAllowance> => {
    if (!publicKey) throw new Error('Connect a Stellar wallet to continue.');
    const server = new rpc.Server(getPublicEnv().sorobanRpcUrl);
    const source = await server.getAccount(publicKey);
    const token = new Contract(tokenId);
    const call = async (method: string, args: ReturnType<typeof nativeToScVal>[]) => {
      const tx = new TransactionBuilder(source, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASES[activeNetwork],
      }).addOperation(token.call(method, ...args)).setTimeout(30).build();
      const result = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(result)) throw new Error(result.error);
      const value = result.result?.retval;
      if (!value) throw new Error(`SEP-41 ${method} returned no value.`);
      return BigInt(value.u128().toString());
    };
    const [balance, allowance] = await Promise.all([
      call('balance', [new Address(publicKey).toScVal()]),
      call('allowance', [new Address(publicKey).toScVal(), new Address(spender).toScVal()]),
    ]);
    return { balance, allowance };
  }, [activeNetwork, publicKey]);

  const enroll = useCallback(async (input: {
    tokenId: string;
    subscriptionContractId: string;
    planId: string;
    amount: bigint;
    durationSeconds: number;
    currentAllowance: bigint;
  }): Promise<{ hash: string; expiresAt: Date }> => {
    if (!publicKey) throw new Error('Connect a Stellar wallet to continue.');
    const networkPassphrase = NETWORK_PASSPHRASES[activeNetwork];
    const server = new rpc.Server(getPublicEnv().sorobanRpcUrl);
    const source = await server.getAccount(publicKey);
    const token = new Contract(input.tokenId);
    const subscription = new Contract(input.subscriptionContractId);
    let transaction = new TransactionBuilder(source, {
      fee: '100', networkPassphrase,
    }).setTimeout(180);

    // The subscription contract exposes enroll_with_allowance as the atomic
    // entry point: it increases SEP-41 allowance when needed and enrolls in one
    // invocation, so both state changes succeed or roll back together.
    transaction = transaction.addOperation(subscription.call(
      'enroll_with_allowance',
      new Address(publicKey).toScVal(),
      token.address().toScVal(),
      nativeToScVal(input.amount, { type: 'i128' }),
      nativeToScVal(input.currentAllowance < input.amount ? input.amount : input.currentAllowance, { type: 'i128' }),
      nativeToScVal(input.planId, { type: 'string' }),
      nativeToScVal(input.durationSeconds, { type: 'u64' }),
    ));

    const prepared = await server.prepareTransaction(transaction.build());
    const signedXdr = await signTransaction(prepared.toXDR(), { networkPassphrase });
    const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    const sent = await server.sendTransaction(signed);
    if (sent.status === 'ERROR') throw new Error('The subscription transaction was rejected by Stellar.');
    let result = await server.getTransaction(sent.hash);
    while (result.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await server.getTransaction(sent.hash);
    }
    if (result.status !== 'SUCCESS') throw new Error('The subscription transaction failed on chain.');
    return { hash: sent.hash, expiresAt: new Date(Date.now() + input.durationSeconds * 1000) };
  }, [activeNetwork, publicKey, signTransaction]);

  return { inspect, enroll, publicKey };
}
