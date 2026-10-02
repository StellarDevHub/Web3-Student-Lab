import { QueryClient, QueryCache } from '@tanstack/react-query';

const STALE_TIME_MS = 5 * 60 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;
const RETRY_DELAY_MS = 10 * 1000;

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      max: 500,
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
        retryDelay: RETRY_DELAY_MS,
        structuralSharing: 'always',
        placeholderData: undefined,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export type AppQueryClient = ReturnType<typeof makeQueryClient>;

declare global {
  // eslint-disable-next-line no-var
  __TENSTACK_QUERY_CLIEN__?: AppQueryClient;
}

export function getQueryClient(): AppQueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }

  if (!window.__TENSTACK_QUERY_CLIENT__) {
    window.__TENSTACK_QUERY_CLIENT__ = makeQueryClient();
  }

  return window.__TENSTACK_QUERY_CLIENT__;
}

export const queryClient = getQueryClient();
