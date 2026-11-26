'use client';

import { createContext, useContext, type ReactNode } from 'react';

const CSPNonceContext = createContext<string | undefined>(undefined);

export function CSPNonceProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  return <CSPNonceContext.Provider value={nonce}>{children}</CSPNonceContext.Provider>;
}

export function useCSPNonce(): string | undefined {
  return useContext(CSPNonceContext);
}
