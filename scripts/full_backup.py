#!/usr/bin/env python3
"""
Seedance Studio — Full Site Backup + Restore Guide PDF Generator

Run from the project root:
  python3 scripts/full_backup.py

Outputs everything to /Users/armankhan/seedance-backups/<DATE>-FULL-BACKUP/
"""
import os
import sys
import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT

PROJECT_ROOT = Path("/Users/armankhan/seedance-2-generator")
BACKUPS_ROOT = Path("/Users/armankhan/seedance-backups")
NOW = datetime.now()
DATE_TAG = NOW.strftime("%Y-%m-%d-%H%M")
BACKUP_DIR = BACKUPS_ROOT / f"{DATE_TAG}-FULL-BACKUP"


def step(msg):
    print(f"\n→ {msg}")


def run(cmd, check=True, **kw):
    print(f"  $ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    return subprocess.run(cmd, check=check, **kw)


def make_source_zip(out_path: Path):
    step(f"Zipping source code → {out_path.name}")
    excludes_prefixes = ("node_modules/", ".next/", ".git/")
    excludes_files = {".DS_Store"}
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            rel_root = Path(root).relative_to(PROJECT_ROOT)
            # skip excluded dirs
            dirs[:] = [
                d for d in dirs
                if not any(str(rel_root / d).startswith(p.rstrip("/")) for p in excludes_prefixes)
                and d not in {"node_modules", ".next", ".git"}
            ]
            for f in files:
                if f in excludes_files:
                    continue
                src = Path(root) / f
                arc = src.relative_to(PROJECT_ROOT.parent)
                z.write(src, arc)
    print(f"  ✓ {out_path.stat().st_size / 1024 / 1024:.1f} MB")


def make_git_bundle(out_path: Path):
    step(f"Creating git bundle → {out_path.name}")
    run(["git", "bundle", "create", str(out_path), "--all"], cwd=PROJECT_ROOT)
    print(f"  ✓ {out_path.stat().st_size / 1024 / 1024:.1f} MB")


def push_backup_tag():
    tag = f"backup-{DATE_TAG}"
    step(f"Tagging current state and pushing to GitHub → {tag}")
    run(["git", "tag", "-a", tag, "-m", f"Full backup snapshot {DATE_TAG}"], cwd=PROJECT_ROOT)
    run(["git", "push", "origin", tag], cwd=PROJECT_ROOT)
    return tag


def write_manifest(path: Path, source_zip: Path, bundle: Path, tag: str, current_commit: str):
    text = f"""SEEDANCE STUDIO — BACKUP MANIFEST
Created:        {NOW.strftime('%A, %B %d %Y at %I:%M %p')}
Project root:   {PROJECT_ROOT}
Current commit: {current_commit}
GitHub tag:     {tag}

CONTENTS OF THIS BACKUP
=======================

1. {source_zip.name}
   Full source code at this point in time.
   Excludes: node_modules, .next build output, .git history.
   Use to recover individual files quickly.

2. {bundle.name}
   Complete git history including all branches and all tags.
   Use to restore the project to any past commit on a fresh machine:
       git clone {bundle.name} restored-seedance

3. RESTORE-GUIDE.pdf
   Step-by-step recovery instructions for three scenarios.

WHAT IS NOT IN THIS BACKUP (and where to get it)
================================================

A. Environment variables (.env.local with API keys, DB URL, etc.)
   Location: Vercel dashboard → Settings → Environment Variables
   How to back up: see RESTORE-GUIDE.pdf section "Environment Variables".

B. Neon Postgres database (users, creations, payments, visits)
   Location: console.neon.tech → your project → Backups
   Neon takes automatic point-in-time backups. You can also export
   a snapshot from the Neon dashboard at any time.

C. Cloudflare R2 storage (uploaded videos and reference images)
   Location: dash.cloudflare.com → R2 → your bucket
   These files are too large to back up locally. Cloudflare retains
   the live bucket; for an extra copy, use rclone (instructions in PDF).

D. Vercel project settings (custom domain, build config)
   Location: vercel.com → your project → Settings
   Settings can be re-applied manually in 5 minutes.
"""
    path.write_text(text)


# ── PDF GENERATION ────────────────────────────────────────────────────────────

def build_pdf(out_path: Path, source_zip: Path, bundle: Path, tag: str, current_commit: str):
    step(f"Generating restore guide → {out_path.name}")
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Seedance Studio — Backup & Restore Guide",
        author="Seedance Studio",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontName="Helvetica-Bold", fontSize=22, leading=26,
        textColor=colors.HexColor("#7c3aed"), spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontName="Helvetica", fontSize=11, leading=14,
        textColor=colors.HexColor("#475569"), spaceAfter=24,
    )
    h1 = ParagraphStyle(
        "H1", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=15, leading=20,
        textColor=colors.HexColor("#0f172a"), spaceBefore=18, spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontName="Helvetica-Bold", fontSize=12, leading=16,
        textColor=colors.HexColor("#7c3aed"), spaceBefore=14, spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontName="Helvetica", fontSize=10.5, leading=15,
        textColor=colors.HexColor("#1e293b"), spaceAfter=6, alignment=TA_LEFT,
    )
    code = ParagraphStyle(
        "Code", parent=styles["Normal"],
        fontName="Courier", fontSize=9.5, leading=13,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f1f5f9"),
        leftIndent=8, rightIndent=8, borderPadding=8,
        spaceBefore=4, spaceAfter=10,
    )
    note = ParagraphStyle(
        "Note", parent=body,
        backColor=colors.HexColor("#fef3c7"),
        borderPadding=8, leftIndent=8, rightIndent=8,
        spaceBefore=6, spaceAfter=10,
    )
    callout = ParagraphStyle(
        "Callout", parent=body,
        backColor=colors.HexColor("#ecfdf5"),
        borderPadding=8, leftIndent=8, rightIndent=8,
        spaceBefore=6, spaceAfter=10,
    )

    story = []

    # ── COVER ─────────────────────────────────────────────────────────────────
    story.append(Paragraph("Seedance Studio", title_style))
    story.append(Paragraph("Backup &amp; Restore Guide", h1))
    story.append(Paragraph(
        f"Backup created on {NOW.strftime('%A, %B %d %Y at %I:%M %p')}<br/>"
        f"Current commit: <font face='Courier'>{current_commit[:12]}</font><br/>"
        f"GitHub tag: <font face='Courier'>{tag}</font>",
        subtitle_style,
    ))

    story.append(Paragraph("What this guide covers", h1))
    story.append(Paragraph(
        "This guide explains how to recover your Seedance Studio site from "
        "the backup that was just created. It is written so you can follow "
        "it step by step even if something has gone wrong and you are under "
        "pressure. Read the section that matches your situation:",
        body,
    ))

    scenario_data = [
        ["Scenario", "Time", "Section"],
        ["A. I lost or broke a few files and want them back", "2 min", "Page 2"],
        ["B. I want to restore the whole codebase on a new computer", "10 min", "Page 3"],
        ["C. The live site is broken — full disaster recovery", "30 min", "Page 4"],
    ]
    t = Table(scenario_data, colWidths=[3.7 * inch, 0.7 * inch, 0.9 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("LINEBELOW", (0, 1), (-1, -2), 0.5, colors.HexColor("#e2e8f0")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(t)

    story.append(Spacer(1, 12))
    story.append(Paragraph("What is in this backup", h2))
    contents_data = [
        ["File", "What it is"],
        [source_zip.name, "Full source code (zip). Use to copy individual files back."],
        [bundle.name, "Full git history bundle. Restore to any computer, any commit."],
        ["RESTORE-GUIDE.pdf", "This document."],
        ["MANIFEST.txt", "Plain-text summary of this backup."],
    ]
    t = Table(contents_data, colWidths=[2.3 * inch, 3.0 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(t)

    story.append(Paragraph("What is NOT in this backup", h2))
    story.append(Paragraph(
        "Some things are too sensitive or too large to keep on your laptop. "
        "Each of these has a section in this guide explaining how to recover "
        "it from its source:",
        body,
    ))
    not_data = [
        ["Item", "Where it lives"],
        ["Environment variables (API keys, DB URL)", "Vercel dashboard"],
        ["Postgres database (users, creations, payments)", "Neon dashboard"],
        ["Uploaded videos and reference images", "Cloudflare R2 dashboard"],
        ["Custom domain and build settings", "Vercel project settings"],
    ]
    t = Table(not_data, colWidths=[3.0 * inch, 2.3 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dc2626")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fef2f2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fecaca")),
    ]))
    story.append(t)

    # ── SCENARIO A ────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Scenario A — Recover one or two files", h1))
    story.append(Paragraph(
        "<b>Use this if:</b> you accidentally deleted or broke a file, and you "
        "want to grab a clean copy from the backup without changing anything else.",
        body,
    ))

    story.append(Paragraph("Steps", h2))
    story.append(Paragraph(
        "1. In Finder, navigate to <b>~/seedance-backups/</b> and open the "
        f"folder named <b>{BACKUP_DIR.name}</b>.",
        body,
    ))
    story.append(Paragraph(
        f"2. Double-click <font face='Courier'>{source_zip.name}</font> to "
        "unzip it. A new folder called <b>seedance-2-generator</b> appears.",
        body,
    ))
    story.append(Paragraph(
        "3. Inside that folder, find the file you want (for example "
        "<font face='Courier'>src/components/saas/ArmanGallery.jsx</font>) "
        "and copy it back into your live project.",
        body,
    ))
    story.append(Paragraph(
        "4. Open Terminal, navigate to your project, and verify the site "
        "still builds:",
        body,
    ))
    story.append(Paragraph(
        "cd ~/seedance-2-generator<br/>npm run build",
        code,
    ))

    story.append(Paragraph(
        "<b>Tip:</b> if you only need to undo a recent commit, you can also "
        "use git directly: "
        "<font face='Courier'>git revert &lt;commit-hash&gt;</font> creates a "
        "new commit that undoes the bad one without rewriting history.",
        callout,
    ))

    # ── SCENARIO B ────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Scenario B — Restore the whole codebase", h1))
    story.append(Paragraph(
        "<b>Use this if:</b> you got a new computer, or your local copy is "
        "completely broken and you want to start fresh from the backup.",
        body,
    ))

    story.append(Paragraph("Option 1: clone from GitHub (recommended)", h2))
    story.append(Paragraph(
        "Your code is already pushed to GitHub. This is the most reliable "
        "source — it does not depend on your local files.",
        body,
    ))
    story.append(Paragraph(
        "git clone https://github.com/armankhan2014/seedance-2-generator.git<br/>"
        "cd seedance-2-generator<br/>"
        "npm install",
        code,
    ))
    story.append(Paragraph(
        "If you want the exact state from this backup, check out the tag:",
        body,
    ))
    story.append(Paragraph(f"git checkout {tag}", code))

    story.append(Paragraph("Option 2: restore from the local git bundle", h2))
    story.append(Paragraph(
        "If GitHub is not available, the bundle file in this backup contains "
        "every commit, every branch, and every tag — the entire history.",
        body,
    ))
    story.append(Paragraph(
        f"cd ~/seedance-backups/{BACKUP_DIR.name}<br/>"
        f"git clone {bundle.name} restored-seedance<br/>"
        "cd restored-seedance<br/>"
        "npm install",
        code,
    ))

    story.append(Paragraph("After cloning — restoring environment variables", h2))
    story.append(Paragraph(
        "The site will not run without environment variables (API keys, "
        "database URL). Pull them from Vercel:",
        body,
    ))
    story.append(Paragraph(
        "1. Install the Vercel CLI: <font face='Courier'>npm i -g vercel</font><br/>"
        "2. Log in: <font face='Courier'>vercel login</font><br/>"
        "3. Link the project: <font face='Courier'>vercel link</font> "
        "(choose your seedance project)<br/>"
        "4. Pull env vars: <font face='Courier'>vercel env pull .env.local</font><br/>"
        "5. Now you can run the dev server: <font face='Courier'>npm run dev</font>",
        body,
    ))

    story.append(Paragraph(
        "<b>Required env vars</b> (these must exist on Vercel for the site to work):"
        "<br/>• DATABASE_URL (Neon Postgres connection string)"
        "<br/>• NEXTAUTH_SECRET (any long random string)"
        "<br/>• NEXTAUTH_URL (https://seedance.visualseffect.com)"
        "<br/>• GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Google sign-in)"
        "<br/>• SEEDANCE_V2_API_KEY (your AI provider key)"
        "<br/>• WEBHOOK_SECRET (random string for AI provider callback)"
        "<br/>• STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
        "<br/>• R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_URL"
        "<br/>• RESEND_API_KEY (email)"
        "<br/>• ANTHROPIC_API_KEY (AI prompt builder)",
        note,
    ))

    # ── SCENARIO C ────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Scenario C — Full disaster recovery", h1))
    story.append(Paragraph(
        "<b>Use this if:</b> the live site at seedance.visualseffect.com is "
        "down, broken, or has been deleted, and you need to bring it back online "
        "completely.",
        body,
    ))

    story.append(Paragraph("Step 1 — Get the code running locally", h2))
    story.append(Paragraph(
        "Follow Scenario B above to clone the repo and restore environment "
        "variables. Confirm the site runs locally with "
        "<font face='Courier'>npm run dev</font> before continuing.",
        body,
    ))

    story.append(Paragraph("Step 2 — Restore the database", h2))
    story.append(Paragraph(
        "If the Neon database is intact, skip this step — the site will "
        "reconnect as soon as DATABASE_URL is set.",
        body,
    ))
    story.append(Paragraph(
        "If the database is corrupt or deleted:",
        body,
    ))
    story.append(Paragraph(
        "1. Go to <b>console.neon.tech</b> and sign in.<br/>"
        "2. Open your Seedance project.<br/>"
        "3. Click <b>Backups</b> in the left sidebar — Neon keeps automatic "
        "point-in-time snapshots for the last 7 days (free plan) or 30 days "
        "(paid plan).<br/>"
        "4. Click <b>Restore</b> on the snapshot you want and follow the prompts. "
        "Neon will restore in a few minutes.<br/>"
        "5. If you need to start completely fresh: create a new Neon project, "
        "copy its DATABASE_URL into Vercel env vars, then run "
        "<font face='Courier'>npx prisma migrate deploy</font> from the "
        "project to recreate the schema.",
        body,
    ))

    story.append(Paragraph("Step 3 — Restore R2 storage (videos and images)", h2))
    story.append(Paragraph(
        "Cloudflare R2 holds all uploaded reference images and generated "
        "videos. Cloudflare itself maintains the bucket; you do not normally "
        "need to restore it.",
        body,
    ))
    story.append(Paragraph(
        "If the bucket is deleted: at <b>dash.cloudflare.com → R2</b>, "
        "create a new bucket with the same name as before, generate new "
        "API tokens, and update the R2_* env vars on Vercel. <b>Existing "
        "creations whose video files were lost will need to be regenerated</b> — "
        "the database rows still exist but the URLs will 404.",
        body,
    ))
    story.append(Paragraph(
        "<b>Recommended:</b> for an extra copy of R2 contents, install rclone "
        "and run <font face='Courier'>rclone sync r2:your-bucket ~/r2-backup/</font>. "
        "This is optional — Cloudflare's own durability is very high.",
        callout,
    ))

    story.append(Paragraph("Step 4 — Redeploy to Vercel", h2))
    story.append(Paragraph(
        "If your Vercel project still exists:",
        body,
    ))
    story.append(Paragraph(
        "1. Make sure your code is pushed: <font face='Courier'>git push origin main</font>.<br/>"
        "2. Vercel will auto-deploy from the push.<br/>"
        "3. Wait 1–2 minutes for the green check at vercel.com.",
        body,
    ))
    story.append(Paragraph(
        "If your Vercel project was deleted:",
        body,
    ))
    story.append(Paragraph(
        "1. Sign in at <b>vercel.com</b>.<br/>"
        "2. Click <b>Add New → Project</b>.<br/>"
        "3. Import the repo <font face='Courier'>armankhan2014/seedance-2-generator</font>.<br/>"
        "4. In Environment Variables, paste every variable from your local "
        ".env.local (or from your password manager).<br/>"
        "5. Click Deploy. First build takes about 3 minutes.<br/>"
        "6. After deploy succeeds, go to Settings → Domains and add "
        "<b>seedance.visualseffect.com</b>.",
        body,
    ))

    story.append(Paragraph("Step 5 — Reconnect Stripe webhook", h2))
    story.append(Paragraph(
        "If you redeployed to a new Vercel URL, Stripe will not know where "
        "to send payment events.",
        body,
    ))
    story.append(Paragraph(
        "1. At <b>dashboard.stripe.com → Developers → Webhooks</b>, find "
        "the existing endpoint or create a new one.<br/>"
        "2. Set the URL to "
        "<font face='Courier'>https://seedance.visualseffect.com/api/stripe/webhook</font>.<br/>"
        "3. Subscribe to <b>checkout.session.completed</b>.<br/>"
        "4. Copy the new <b>Signing secret</b> and update STRIPE_WEBHOOK_SECRET "
        "on Vercel.",
        body,
    ))

    story.append(Paragraph("Step 6 — Sanity test", h2))
    story.append(Paragraph(
        "Visit <font face='Courier'>https://seedance.visualseffect.com</font> "
        "and verify:",
        body,
    ))
    story.append(Paragraph(
        "• Home page loads and the gallery shows videos.<br/>"
        "• You can sign in with Google.<br/>"
        "• Click a video — modal opens with prompt and reference images.<br/>"
        "• /generate page loads and you can upload an image.<br/>"
        "• Generating a short test video succeeds (uses 1 credit).",
        body,
    ))

    # ── REFERENCE PAGE ────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Quick reference", h1))

    story.append(Paragraph("Where everything lives", h2))
    services_data = [
        ["Service", "Dashboard URL", "What it stores"],
        ["GitHub", "github.com/armankhan2014/seedance-2-generator", "Source code &amp; history"],
        ["Vercel", "vercel.com", "Deployment, env vars, custom domain"],
        ["Neon", "console.neon.tech", "Postgres database"],
        ["Cloudflare R2", "dash.cloudflare.com", "Videos &amp; uploaded images"],
        ["Stripe", "dashboard.stripe.com", "Payments &amp; webhook"],
        ["Resend", "resend.com", "Outgoing email"],
        ["Anthropic", "console.anthropic.com", "AI prompt-builder API key"],
        ["Google Cloud", "console.cloud.google.com", "Google sign-in OAuth client"],
    ]
    t = Table(services_data, colWidths=[1.0 * inch, 2.7 * inch, 2.0 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
            [colors.HexColor("#f8fafc"), colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(t)

    story.append(Paragraph("Useful commands cheat-sheet", h2))
    cheats = [
        ("Run dev server", "npm run dev"),
        ("Build for production", "npm run build"),
        ("Push code to deploy", "git push origin main"),
        ("Pull env vars from Vercel", "vercel env pull .env.local"),
        ("Restore one file from a past commit", "git checkout COMMIT_HASH -- path/to/file"),
        ("List all backup tags", "git tag -l 'backup-*'"),
        ("Restore from backup tag", f"git checkout {tag}"),
        ("Open Prisma Studio (browse DB)", "npx prisma studio"),
        ("Run DB migrations", "npx prisma migrate deploy"),
    ]
    cheat_data = [["Task", "Command"]] + [list(x) for x in cheats]
    t = Table(cheat_data, colWidths=[2.4 * inch, 3.3 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
            [colors.HexColor("#f8fafc"), colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(t)

    story.append(Paragraph("Recommended backup schedule", h2))
    story.append(Paragraph(
        "<b>Code:</b> already automatic — every git push to GitHub creates a "
        "permanent record.<br/>"
        "<b>Full backup like this one:</b> run <font face='Courier'>"
        "python3 scripts/full_backup.py</font> from your project root once a "
        "month, or before any major change.<br/>"
        "<b>Database:</b> Neon does this automatically. Check that your plan "
        "matches the retention you need.<br/>"
        "<b>Environment variables:</b> export them once a month with "
        "<font face='Courier'>vercel env pull</font> and store the resulting "
        ".env.local file in your password manager (1Password, Bitwarden, etc.).",
        body,
    ))

    doc.build(story)
    print(f"  ✓ {out_path.stat().st_size / 1024:.0f} KB")


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Seedance Studio — Full Site Backup")
    print("=" * 60)
    print(f"\nBackup will be saved to: {BACKUP_DIR}\n")

    # Make backup folder
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # Get current commit
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT
    ).decode().strip()
    print(f"Current commit: {head}")

    # 1. Source zip
    source_zip = BACKUP_DIR / "source-code.zip"
    make_source_zip(source_zip)

    # 2. Git bundle
    bundle = BACKUP_DIR / "git-repo.bundle"
    make_git_bundle(bundle)

    # 3. Push backup tag to GitHub
    tag = push_backup_tag()

    # 4. Manifest
    manifest = BACKUP_DIR / "MANIFEST.txt"
    write_manifest(manifest, source_zip, bundle, tag, head)

    # 5. PDF guide
    pdf = BACKUP_DIR / "RESTORE-GUIDE.pdf"
    build_pdf(pdf, source_zip, bundle, tag, head)

    # Summary
    total = sum(p.stat().st_size for p in BACKUP_DIR.iterdir())
    print()
    print("=" * 60)
    print("  ✓ Backup complete")
    print("=" * 60)
    print(f"  Folder:   {BACKUP_DIR}")
    print(f"  Total:    {total / 1024 / 1024:.1f} MB")
    print(f"  GH tag:   {tag}")
    print()
    print("  Open the PDF for full restore instructions:")
    print(f"  open '{pdf}'")
    print()


if __name__ == "__main__":
    main()
