"use client";

import { createContext, useContext } from "react";

// Carries the server-detected "is this the iOS App Store build?" flag down
// to client components so they can hide pricing / buy buttons WITHOUT a
// hydration flash. The value is computed once on the server (root layout,
// via the User-Agent — see src/lib/iosApp.js) and passed straight in, so
// the server-rendered HTML already has the purchase UI hidden and the
// client render matches it exactly. See [[iosApp]].
const IOSAppContext = createContext(false);

export function IOSAppProvider({ value, children }) {
  return <IOSAppContext.Provider value={!!value}>{children}</IOSAppContext.Provider>;
}

// true when running inside the native iOS app — hide all pricing/buy UI.
export function useIsIOSApp() {
  return useContext(IOSAppContext);
}
