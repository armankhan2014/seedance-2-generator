"use client";
// Seedance generator's wrapper around the auth-agnostic EcosystemNav.
// NextAuth on this side, identical pattern to community's wrapper —
// the only difference is the credits endpoint (/api/user/profile)
// and the avatar fallback (no story-ring provider here yet).
//
// IMPORTANT — per the seedance auth/cookie incident history we do
// NOT touch SessionProvider / authOptions / cookie config. This
// component is purely presentational: it reads the existing session
// and the existing /api/user/profile endpoint that powers the
// existing Navbar's credit pill. Removable without auth side effects.

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import EcosystemNav from "./EcosystemNav";

export default function SeedanceEcosystemNav({ children = null }) {
  const { data: session, status } = useSession();
  const user = session?.user || null;
  const [credits, setCredits] = useState(null);
  const [liveImage, setLiveImage] = useState(null);

  // Reuse the same endpoint the existing Navbar polls. Single fetch
  // on session-id change keeps it cheap; the existing Navbar's own
  // refresh-on-mount continues independently so we don't introduce
  // a second polling loop here.
  useEffect(() => {
    if (!user?.id) {
      setCredits(null);
      setLiveImage(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.credits === "number") setCredits(data.credits);
        if (data.image) setLiveImage(data.image);
      } catch {
        /* ignore — eco-strip degrades to no-credits */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const userObj = user
    ? {
        id: user.id,
        name: user.name || user.email?.split("@")[0] || "You",
        image: liveImage || user.image || null,
        verified: !!user.verified,
      }
    : null;

  return (
    <EcosystemNav
      user={userObj}
      status={status}
      credits={credits}
      onSignOut={() => signOut({ callbackUrl: "/" })}
      profileHref="/account"
      settingsHref="/account"
      signInHref="/signin"
      // Seedance has no in-app bell yet — wrapper omits and the strip
      // collapses gracefully. Hook up when /api/notifications lands.
      bell={null}
      avatar={
        userObj?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userObj.image}
            alt=""
            width={32}
            height={32}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid var(--accent-soft-border)",
              display: "block",
            }}
          />
        ) : (
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              fontSize: 13,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {((userObj?.name || "?")[0] || "?").toUpperCase()}
          </span>
        )
      }
    >
      {children}
    </EcosystemNav>
  );
}
