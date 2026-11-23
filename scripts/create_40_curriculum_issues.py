#!/usr/bin/env python3
import os
import re
import subprocess
import sys

def parse_issues(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} does not exist")
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by the level 3 headers representing individual issues
    raw_blocks = content.split('### Issue #')
    issues = []

    # The first block is the table of contents / intro, skip it
    for block in raw_blocks[1:]:
        lines = block.strip().split('\n')
        if not lines:
            continue

        # First line is: "1: `[Backend] Title`"
        header = lines[0].strip()
        
        # Extract title by stripping any leading digits, colons, and backticks
        # Example: "1: `[Backend] Update Prisma Schema`" -> "[Backend] Update Prisma Schema"
        title_match = re.match(r'^\d+:\s*`?([^`\n]+)`?$', header)
        if title_match:
            title = title_match.group(1).strip()
        else:
            # Fallback extraction
            title = re.sub(r'^\d+:\s*', '', header).strip('` ')

        # The body is the rest of the lines
        body = '\n'.join(lines[1:]).strip()

        issues.append({
            "title": title,
            "body": body
        })

    return issues

def main():
    filepath = "/home/knights/.gemini/antigravity/brain/9bda9fc5-5386-4038-85b7-b4e80e44fc0e/proposed_40_issues.md"
    print(f"Parsing issues from {filepath}...")
    issues = parse_issues(filepath)
    print(f"Successfully parsed {len(issues)} issues.")

    if not issues:
        print("No issues found to create.")
        return

    # Clear GITHUB_TOKEN to force gh to use local keyring auth
    env = os.environ.copy()
    env["GITHUB_TOKEN"] = ""

    for i, issue in enumerate(issues, 1):
        title = issue["title"]
        body = issue["body"]
        print(f"Creating issue {i}/{len(issues)}: {title}...")

        # Construct gh command to create issue
        cmd = [
            "gh", "issue", "create",
            "--title", title,
            "--body", body,
            "--label", "Stellar Wave"
        ]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode == 0:
            # Output will contain the URL of the created issue
            url = result.stdout.strip()
            print(f"✓ Created: {url}")
        else:
            print(f"✗ Failed to create issue '{title}': {result.stderr.strip()}")

    print("✅ All issues processed!")

if __name__ == "__main__":
    main()
