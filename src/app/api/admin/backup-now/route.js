import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAIL = "armankhan0826@gmail.com";
const REPO_OWNER  = "armankhan2014";
const REPO_NAME   = "seedance-2-generator";
const WORKFLOW    = "db-backup.yml";

// Triggers the hourly DB backup workflow on demand. Wrapped in admin auth
// so only Arman can fire it. Uses GITHUB_BACKUP_TOKEN — a fine-grained PAT
// with only "Actions: write" on this single repo. Even if that token is
// leaked, the worst an attacker can do is queue extra backup runs.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_BACKUP_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Backup not configured. Add GITHUB_BACKUP_TOKEN to Vercel env vars." },
      { status: 503 },
    );
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW}/dispatches`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("[BACKUP_NOW] GitHub returned", r.status, detail.slice(0, 300));
    return NextResponse.json(
      { error: `GitHub API rejected the request (HTTP ${r.status}). Check the token has "Actions: write" permission.` },
      { status: 502 },
    );
  }

  const actionsUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW}`;
  return NextResponse.json({ success: true, actionsUrl });
}
