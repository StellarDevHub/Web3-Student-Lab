#!/usr/bin/env python3
"""
Close all legacy issues created before November 1st, 2026 as superseded.
Leaves only the 150 new production issues (#1748 - #1897) in the open tracker.
"""

import json
import subprocess
import sys
import time

sys.stdout.reconfigure(line_buffering=True)

REPO = "StellarDevHub/Web3-Student-Lab"
CUTOFF_DATE = "2026-11-01"
COMMENT_TEXT = "Closed as superseded by the Final Stage Production Deployment Roadmap (Issues #1748–#1897: FE-051..100, BE-051..100, SC-051..100)."

def get_old_open_issues():
    cmd = [
        "gh", "issue", "list",
        "--repo", REPO,
        "--search", f"created:<{CUTOFF_DATE} is:open",
        "--limit", "200",
        "--json", "number,title,createdAt"
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error fetching issues: {result.stderr}")
        return []
    return json.loads(result.stdout)

def close_issue(issue_num, title):
    cmd = [
        "gh", "issue", "close", str(issue_num),
        "--repo", REPO,
        "--reason", "not planned",
        "--comment", COMMENT_TEXT
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result.returncode == 0, result.stderr

def main():
    issues = get_old_open_issues()
    total = len(issues)
    print(f"Found {total} open issues created before {CUTOFF_DATE}.")

    if total == 0:
        print("No old open issues found. Nothing to close.")
        return

    success_count = 0
    for idx, iss in enumerate(issues, start=1):
        num = iss["number"]
        title = iss["title"]
        print(f"[{idx}/{total}] Closing #{num}: {title[:60]}...")
        ok, err = close_issue(num, title)
        if ok:
            print(f"  --> Closed #{num}")
            success_count += 1
        else:
            print(f"  --> Error closing #{num}: {err.strip()}")
        time.sleep(1.0)

    print(f"\nDone! Successfully closed {success_count}/{total} legacy issues.")

if __name__ == "__main__":
    main()
