#!/usr/bin/env python3
"""
Automated Publisher for Web3 Student Lab: Final Stage 150 Production Deployment Issues.
Publishes FE-051..100, BE-051..100, and SC-051..100 to StellarDevHub/Web3-Student-Lab via the gh CLI.

Features:
- Idempotent: tracks published issues in scripts/.pushed_production_issues.json.
- Rate-limit resilient: pauses between requests and implements exponential backoff on 403/429.
- Formatted matching repository issue standards.
"""

import json
import os
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(line_buffering=True)

ROADMAP_PATH = "FINAL_PRODUCTION_ISSUES_ROADMAP.md"
STATE_FILE = "scripts/.pushed_production_issues.json"
REPO = "StellarDevHub/Web3-Student-Lab"
DELAY_BETWEEN_CALLS = 1.5  # Seconds between requests to avoid secondary rate limits

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

def extract_field(name, text):
    m = re.search(r'\*\*' + name + r':\*\*\s*([^\n]+(?:\n(?!\s*-\s*\*\*)[^\n]+)*)', text)
    return m.group(1).strip() if m else ''

def parse_issues(roadmap_file):
    with open(roadmap_file, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = r'###\s+([A-Z]{2}-\d{3}):\s+([^\n]+)\n(.*?)(?=(?:\n###\s+[A-Z]{2}-\d{3}:|\Z))'
    matches = re.findall(pattern, content, re.DOTALL)
    
    issues = []
    for issue_id, title, raw_body in matches:
        category = extract_field('Category', raw_body)
        diff_line = extract_field('Difficulty', raw_body)
        problem = extract_field('Problem Statement', raw_body)
        spec = extract_field('Specification', raw_body)
        files = extract_field('Files Involved', raw_body)
        ac_m = re.search(r'\*\*Acceptance Criteria:\*\*\s*\n((?:\s*-\s*\[\s*\].*\n?)+)', raw_body)
        criteria = ac_m.group(1).strip() if ac_m else ''

        # Parse Difficulty, Priority, ETA
        diff = "Hard"
        if "Difficulty:**" in raw_body or "Difficulty:" in raw_body:
            dm = re.search(r'Difficulty:\*\*\s*([^|]+)', diff_line)
            if dm: diff = dm.group(1).strip()
            elif "|" in diff_line: diff = diff_line.split("|")[0].strip()

        priority = "High"
        pm = re.search(r'Priority:\*\*\s*([^|]+)', diff_line)
        if pm: priority = pm.group(1).strip()

        eta = "2 Days"
        em = re.search(r'ETA:\*\*\s*([^\n|]+)', diff_line)
        if em: eta = em.group(1).strip()

        # Build labels
        labels = ["Stellar Wave", "complexity-hard", "open-source-ready"]
        if issue_id.startswith("FE"):
            labels.append("frontend")
        elif issue_id.startswith("BE"):
            labels.append("backend")
        elif issue_id.startswith("SC"):
            labels.extend(["smart-contract", "soroban"])

        # Supplemental labels based on topic
        context_text = f"{title} {category} {problem}".lower()
        if any(w in context_text for w in ["security", "vulnerability", "auth", "exploit", "attack", "privilege"]):
            labels.append("security")
        if any(w in context_text for w in ["database", "prisma", "postgres"]):
            labels.append("database")
        if any(w in context_text for w in ["caching", "cache"]):
            labels.append("caching")
        if any(w in context_text for w in ["rate limit", "throttl", "bucket"]):
            labels.append("rate-limiting")
        if any(w in context_text for w in ["performance", "optimiz"]):
            labels.append("performance")
        if any(w in context_text for w in ["testing", "benchmark", "stress"]):
            labels.append("testing")
        if any(w in context_text for w in ["infrastructure", "devops", "canary", "docker", "pipeline"]):
            labels.append("infrastructure")
        if any(w in context_text for w in ["stellar", "horizon", "rpc", "soroban"]):
            labels.append("stellar-integration")

        # De-duplicate labels
        unique_labels = []
        for l in labels:
            if l not in unique_labels:
                unique_labels.append(l)

        # Assemble markdown body
        body = f"""## 📋 Overview

• **Identifier:** {issue_id}
• **Domain Category:** {category}
• **Difficulty:** {diff}
• **Deployment Priority:** {priority}
• **Estimated Time of Completion (ETA):** {eta}

---

### 🚨 Problem Statement

{problem}

---

### 🛠️ Technical Specification & Architecture

{spec}

---

### 📂 Key Files Involved

{files}

---

### ✅ Acceptance Criteria

{criteria}

---

*Created as part of the Web3 Student Lab Final Stage Production Deployment Roadmap.*"""

        issues.append({
            "id": issue_id,
            "title": f"[{issue_id}] {title.strip()}",
            "body": body,
            "labels": unique_labels
        })

    return issues

def create_issue(issue, max_retries=5):
    cmd = [
        "gh", "issue", "create",
        "--repo", REPO,
        "--title", issue["title"],
        "--body", issue["body"]
    ]
    for lbl in issue["labels"]:
        cmd.extend(["--label", lbl])

    attempt = 0
    backoff = 10
    while attempt < max_retries:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            url = result.stdout.strip()
            return url
        
        err = result.stderr.strip()
        # Check for secondary rate limit or abuse detection
        if "rate limit" in err.lower() or "secondary rate" in err.lower() or "403" in err:
            print(f"  [Rate Limit Triggered] Sleeping {backoff}s before retry (Attempt {attempt + 1}/{max_retries})...")
            time.sleep(backoff)
            backoff *= 2
            attempt += 1
        elif "could not add label" in err.lower():
            # If a label doesn't exist, remove supplemental labels and fallback to base labels
            print(f"  [Label Warning] Label error: {err}. Retrying with minimal labels...")
            minimal_labels = ["Stellar Wave", "complexity-hard"]
            if issue["id"].startswith("FE"): minimal_labels.append("frontend")
            elif issue["id"].startswith("BE"): minimal_labels.append("backend")
            elif issue["id"].startswith("SC"): minimal_labels.extend(["smart-contract", "soroban"])
            
            cmd = [
                "gh", "issue", "create",
                "--repo", REPO,
                "--title", issue["title"],
                "--body", issue["body"]
            ]
            for lbl in minimal_labels:
                cmd.extend(["--label", lbl])
            attempt += 1
            time.sleep(2)
        else:
            print(f"  [Error] Failed to create {issue['id']}: {err}")
            return None

    return None

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Publish 150 production issues to GitHub.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without creating issues.")
    parser.add_argument("--limit", type=int, default=150, help="Max issues to create in this run.")
    parser.add_argument("--start", type=int, default=1, help="Start index (1-based).")
    parser.add_argument("--prefix", type=str, choices=["FE", "BE", "SC", "ALL"], default="ALL", help="Filter by prefix.")
    args = parser.parse_args()

    issues = parse_issues(ROADMAP_PATH)
    if args.prefix != "ALL":
        issues = [iss for iss in issues if iss["id"].startswith(args.prefix)]

    state = load_state()
    total = len(issues)
    print(f"Loaded {total} issues for publication.")

    created_count = 0
    for idx, iss in enumerate(issues, start=1):
        if idx < args.start:
            continue
        if created_count >= args.limit:
            print(f"Reached limit of {args.limit} issues.")
            break

        issue_id = iss["id"]
        if issue_id in state:
            print(f"[{idx}/{total}] Skipping {issue_id} (already created: {state[issue_id]})")
            continue

        if args.dry_run:
            print(f"[{idx}/{total}] [DRY-RUN] Would create: {iss['title']} with labels {iss['labels']}")
            created_count += 1
            continue

        print(f"[{idx}/{total}] Creating {issue_id}: {iss['title']}...")
        url = create_issue(iss)
        if url:
            state[issue_id] = url
            save_state(state)
            print(f"  --> Success: {url}")
            created_count += 1
            time.sleep(DELAY_BETWEEN_CALLS)
        else:
            print(f"  --> Failed to create {issue_id}, aborting loop to prevent cascade.")
            break

    print(f"\nDone! Created {created_count} issues in this session.")
    print(f"Total tracked issues in state: {len(state)}/150")

if __name__ == "__main__":
    main()
