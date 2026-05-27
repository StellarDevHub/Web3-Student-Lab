import { useEffect, useState } from 'react';
import { CollaborationProvider } from './YjsProvider';

export function useWebSocketStatus(provider: CollaborationProvider | null) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!provider) return;

    const onStatus = (event: any) => {
      setStatus(event.status);
    };

    provider.provider.on('status', onStatus);
    setStatus(provider.provider.shouldConnect ? 'connecting' : 'disconnected');

    return () => {
      provider.provider.off('status', onStatus);
    };
  }, [provider]);

  return status;
}
