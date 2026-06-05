"use client";
// Tiny context that lets the MobileTabBar (or anywhere else)
// open the EcosystemNav's apps switcher without prop-drilling
// through AppShell. The provider is mounted once at the top of
// AppShell; consumers call useAppsPanel().open().

import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext({ open: () => {}, close: () => {}, isOpen: false });

export function AppsPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <Ctx.Provider value={{ open, close, isOpen, setIsOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppsPanel() {
  return useContext(Ctx);
}
