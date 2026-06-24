"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { setupNativePush } from "@/lib/nativePush";
import { IOSAppProvider } from "@/components/IOSAppContext";

// Receives the server-prefetched session from the root layout so
// useSession() returns the right answer on the very first render —
// no client-side fetch round-trip, no flash of "Sign in" button
// after a successful login. If `session` is null/undefined the
// SessionProvider falls back to its default behaviour and fetches
// from /api/auth/session itself.
export function Providers({ children, session, isIOSApp = false }) {
  return (
    <SessionProvider session={session}>
      <IOSAppProvider value={isIOSApp}>
        <NativePushBootstrap />
        {children}
      </IOSAppProvider>
    </SessionProvider>
  );
}

// Headless bootstrap — fires Capacitor push registration the first
// time we have an authenticated session. setupNativePush is a no-op
// on plain browsers (isNativeApp returns false), so this is free for
// web users. On native, it triggers the iOS / Android permission
// dialog and posts the FCM/APNS token to /api/devices/register.
function NativePushBootstrap() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    setupNativePush();
  }, [status]);
  return null;
}
