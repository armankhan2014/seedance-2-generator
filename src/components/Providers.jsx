"use client";

import { SessionProvider } from "next-auth/react";

// Receives the server-prefetched session from the root layout so
// useSession() returns the right answer on the very first render —
// no client-side fetch round-trip, no flash of "Sign in" button
// after a successful login. If `session` is null/undefined the
// SessionProvider falls back to its default behaviour and fetches
// from /api/auth/session itself.
export function Providers({ children, session }) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
