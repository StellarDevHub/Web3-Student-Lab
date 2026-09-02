import { useCallback, useState } from 'react';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import Eth from '@ledgerhq/hw-app-eth';

interface UseHardwareWalletResult {
  isSupported: boolean;
  isConnected: boolean;
  isBusy: boolean;
  address: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signPersonalMessage: (message: string) => Promise<string | null>;
}

export const useHardwareWallet = (): UseHardwareWalletResult => {
  const [transport, setTransport] = useState<TransportWebHID | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = typeof window !== 'undefined' && 'hid' in navigator;
  const isConnected = Boolean(transport && address);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('WebHID is not available in this browser');
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const newTransport = await TransportWebHID.create();
      const eth = new Eth(newTransport);
      const result = await eth.getAddress("44'/60'/0'/0/0", false, true);
      setTransport(newTransport);
      setAddress(result.address);
    } catch (err) {
      setError('Unable to connect to Ledger device.');
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  }, [isSupported]);

  const disconnect = useCallback(async () => {
    if (!transport) return;
    setIsBusy(true);
    try {
      await transport.close();
      setTransport(null);
      setAddress(null);
    } catch (err) {
      setError('Failed to disconnect hardware wallet.');
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  }, [transport]);

  const signPersonalMessage = useCallback(
    async (message: string) => {
      if (!transport) {
        setError('Hardware wallet is not connected');
        return null;
      }

      setIsBusy(true);
      setError(null);

      try {
        const eth = new Eth(transport);
        const bytes = new TextEncoder().encode(message);
        const messageHex = Array.from(bytes)
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        const result = await eth.signPersonalMessage("44'/60'/0'/0/0", messageHex);
        return `0x${result.r}${result.s}${result.v.toString(16)}`;
      } catch (err) {
        setError('Signing operation failed');
        console.error(err);
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [transport]
  );

  return {
    isSupported,
    isConnected,
    isBusy,
    address,
    error,
    connect,
    disconnect,
    signPersonalMessage,
  };
};
