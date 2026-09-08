import { QueryClient } from "@tanstack/react-query";

/**
 * Shared query client.
 *
 * Retrying a 401/403 is pointless — the session is gone until the user logs in
 * again — so auth failures fail fast while transient errors get one retry.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

export default queryClient;
