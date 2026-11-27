#!/usr/bin/env python3
"""
Batch script to remove the 'Stellar Wave' label from all open issues in StellarDevHub/Web3-Student-Lab.
"""
import json
import os
import subprocess
import sys
import time

sys.stdout.reconfigure(line_buffering=True)

REPO = "StellarDevHub/Web3-Student-Lab"
LABEL_TO_REMOVE = "Stellar Wave"
DELAY_BETWEEN_CALLS = 0.8  # Seconds to wait between calls to respect secondary rate limits

def main():
    env = os.environ.copy()
    if "GITHUB_TOKEN" in env and not env["GITHUB_TOKEN"]:
        del env["GITHUB_TOKEN"]

    print(f"Querying issues with label '{LABEL_TO_REMOVE}' in {REPO}...")
    cmd = [
        "gh", "issue", "list",
        "--repo", REPO,
        "-l", LABEL_TO_REMOVE,
        "--limit", "300",
        "--json", "number,title"
    ]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error listing issues: {result.stderr}")
        return

    issues = json.loads(result.stdout)
    total = len(issues)
    print(f"Found {total} issues with label '{LABEL_TO_REMOVE}'.")

    if total == 0:
        print("No issues found with this label. Nothing to do.")
        return

    success_count = 0
    for i, issue in enumerate(issues, 1):
        num = issue["number"]
        title = issue.get("title", "")[:50]
        print(f"[{i}/{total}] Removing '{LABEL_TO_REMOVE}' from #{num} ({title})...")
        
        edit_cmd = [
            "gh", "issue", "edit", str(num),
            "--repo", REPO,
            "--remove-label", LABEL_TO_REMOVE
        ]
        
        # Retry logic for rate limits
        retries = 3
        backoff = 5
        while retries > 0:
            edit_res = subprocess.run(edit_cmd, env=env, capture_output=True, text=True)
            if edit_res.returncode == 0:
                print(f"  ✓ Successfully removed from #{num}")
                success_count += 1
                break
            
            err = edit_res.stderr.strip()
            if "rate limit" in err.lower() or "secondary rate" in err.lower() or "403" in err:
                print(f"  [Rate limit warning] Sleeping {backoff}s before retry...")
                time.sleep(backoff)
                backoff *= 2
                retries -= 1
            else:
                print(f"  ✗ Failed for #{num}: {err}")
                break
        
        time.sleep(DELAY_BETWEEN_CALLS)

    print(f"\nDone! Successfully removed '{LABEL_TO_REMOVE}' from {success_count}/{total} issues.")

if __name__ == "__main__":
    main()
