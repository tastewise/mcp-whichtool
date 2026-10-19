import { QueryClient } from "@tanstack/react-query";

// Polling is the source of freshness, as in main.js; focus refetches and retries add nothing the old page did.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 } },
});
