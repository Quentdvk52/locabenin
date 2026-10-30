"use client";

// ============================================================
// LocaBénin — Providers globaux : thème (next-themes), TanStack Query,
// session utilisateur, toasts (sonner).
// ============================================================

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/client/session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
