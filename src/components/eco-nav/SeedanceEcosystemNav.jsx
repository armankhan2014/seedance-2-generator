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
import UniversalNotificationsBell from "./UniversalNotificationsBell";

export default function SeedanceEcosystemNav({ children = null }) {
  const { data: session, status } = useSession();
  const user = session?.user || null;
  const [credits, setCredits] = useState(null);
  const [liveImage, setLiveImage] = useState(null);
  const [resume, setResume] = useState([]);

  // Two sources:
  //   (1) /api/user/profile — local endpoint that powers the existing
  //       Navbar's credit pill. Same DB, same balance, but local so
  //       it stays fast even if community is temporarily unreachable.
  //   (2) https://community.visualseffect.com/api/me/active-sessions —
  //       cross-origin via credentials: "include" (session cookie is
  //       Domain=.visualseffect.com). Hub-side aggregation so the apps
  //       panel can show Jump back in cards. CORS-allowed.
  useEffect(() => {
    if (!user?.id) {
      setCredits(null);
      setLiveImage(null);
      setResume([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const [profile, sessions] = await Promise.all([
          fetch("/api/user/profile", { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(
            "https://community.visualseffect.com/api/me/active-sessions",
            { credentials: "include", cache: "no-store" }
          ).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        if (profile?.credits !== undefined) setCredits(profile.credits);
        if (profile?.image) setLiveImage(profile.image);
        if (sessions && Array.isArray(sessions.items))
          setResume(sessions.items);
      } catch {
        /* ignore — eco-strip degrades to no-credits */
      }
    };
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 90_000);
    return () => {
      cancelled = true;
      clearInterval(id);
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
      resume={resume}
      onSignOut={() => signOut({ callbackUrl: "/" })}
      profileHref="/account"
      settingsHref="/account"
      signInHref="/signin"
      // Universal bell polls community cross-origin so the same
      // notifications show up here as on community itself.
      bell={<UniversalNotificationsBell />}
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
