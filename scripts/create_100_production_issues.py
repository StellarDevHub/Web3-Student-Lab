#!/usr/bin/env python3
"""
Batch script to create the 100 Hard & Advanced Production Epics on GitHub via the gh CLI.
Each epic compounds easy and medium tasks into a hard/advanced deliverable.

Usage:
  python3 scripts/create_100_production_issues.py --dry-run --start 1 --end 5
  python3 scripts/create_100_production_issues.py --start 1 --end 10
"""

import argparse
import re
import subprocess
import sys
import time

PRIMARY_CATALOG = "/Users/mac/.gemini/antigravity-ide/brain/b12f362d-2d85-4236-9469-cafae12b4a7b/mvp_production_100_hard_issues.md"
EXTENSION_CATALOG = "/Users/mac/.gemini/antigravity-ide/brain/b12f362d-2d85-4236-9469-cafae12b4a7b/mvp_production_30_more_hard_issues.md"

def parse_hard_issues(markdown_files):
    if isinstance(markdown_files, str):
        markdown_files = [markdown_files]

    issues = []
    for fpath in markdown_files:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        pattern = r"(\d+)\.\s+\*\*\[([A-Z0-9-]+)\]\s+([^*]+)\*\*\s*\n((?:\s+-\s+\*\*[^*]+\*\*:[^\n]*\n*)+)"
        matches = re.findall(pattern, content)

        for num, tag, title, body_text in matches:
            full_title = f"[{tag}] {title.strip()}"
            
            # Determine labels matching repository configuration
            labels = ["complexity-hard", "feature"]
            if tag.startswith("FE"):
                labels.append("frontend")
            elif tag.startswith("SC"):
                labels.append("smart-contract")
            elif tag.startswith("BE"):
                labels.append("backend")

            # Format markdown body for GitHub
            body = (
                f"## 📋 Hard & Advanced Production Epic\n"
                f"**Identifier**: `{tag}` | **Complexity**: `Hard / Advanced`\n\n"
                f"### ⚙️ Specifications & Architectural Breakdown\n"
                f"{body_text.strip()}\n\n"
                f"---\n"
                f"*Generated for Web3 Student Lab Production & MVP Transition.*"
            )
            
            issues.append({
                "number": int(num),
                "tag": tag,
                "title": full_title,
                "body": body,
                "labels": labels
            })

    # Sort issues by issue number
    issues.sort(key=lambda x: x["number"])
    return issues

def create_issue(issue, dry_run=False):
    title = issue["title"]
    body = issue["body"]
    labels = ",".join(issue["labels"])

    print(f"[{issue['number']}/130] Creating: {title}...")
    if dry_run:
        print(f"  [DRY RUN] gh issue create --title \"{title}\" --label \"{labels}\"")
        return True

    cmd = [
        "gh", "issue", "create",
        "--title", title,
        "--body", body,
        "--label", labels
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"  ✓ Created: {res.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Error creating issue: {e.stderr.strip()}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Create Hard Production Epics on GitHub")
    parser.add_argument("--dry-run", action="store_true", help="Print issue commands without creating them")
    parser.add_argument("--catalog", type=str, default=None, help="Path to custom catalog markdown file")
    parser.add_argument("--start", type=int, default=101, help="Start issue number (1-130)")
    parser.add_argument("--end", type=int, default=130, help="End issue number (1-130)")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay in seconds between creations")
    args = parser.parse_args()

    files = [args.catalog] if args.catalog else [PRIMARY_CATALOG, EXTENSION_CATALOG]
    issues = parse_hard_issues(files)
    print(f"Parsed {len(issues)} Hard Epics across catalog(s).")

    selected = [i for i in issues if args.start <= i["number"] <= args.end]
    print(f"Queued {len(selected)} issues for processing (Range: {args.start} to {args.end})...\n")

    for issue in selected:
        create_issue(issue, dry_run=args.dry_run)
        if not args.dry_run and issue != selected[-1]:
            time.sleep(args.delay)

    print("\n✓ Finished processing issues.")

if __name__ == "__main__":
    main()
