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

        # First line is: "41: `[Smart Contract] Implement ...`"
        header = lines[0].strip()
        
        # Extract title by stripping any leading digits, colons, and backticks
        title_match = re.match(r'^\d+:\s*`?([^`\n]+)`?$', header)
        if title_match:
            title = title_match.group(1).strip()
        else:
            title = re.sub(r'^\d+:\s*', '', header).strip('` ')

        # Now parse the rest of the block
        difficulty = "Intermediate"
        timeline = "2 days"
        feature_overview = ""
        impl_requirements = []
        tech_specs = []
        acceptance_criteria = []

        current_section = None
        
        for line in lines[1:]:
            line_str = line.strip()
            if not line_str:
                continue
            
            # Extract basic metadata
            if line_str.startswith("* **Difficulty:**"):
                difficulty = line_str.replace("* **Difficulty:**", "").strip()
                continue
            if line_str.startswith("* **Timeline:**"):
                timeline = line_str.replace("* **Timeline:**", "").strip()
                continue
            
            # Detect section transitions
            if line_str.startswith("* **Feature Overview:**"):
                current_section = "overview"
                feature_overview = line_str.replace("* **Feature Overview:**", "").strip()
                continue
            elif line_str.startswith("* **Implementation Requirements:**"):
                current_section = "reqs"
                continue
            elif line_str.startswith("* **Technical Specifications:**"):
                current_section = "specs"
                continue
            elif line_str.startswith("* **Acceptance Criteria:**"):
                current_section = "criteria"
                continue
            
            # Add items depending on the active section
            if current_section == "overview":
                feature_overview += " " + line_str
            elif current_section == "reqs":
                cleaned = re.sub(r'^[-*+]\s*', '', line_str)
                impl_requirements.append(f"- {cleaned}")
            elif current_section == "specs":
                cleaned = re.sub(r'^[-*+]\s*', '', line_str)
                tech_specs.append(f"- {cleaned}")
            elif current_section == "criteria":
                cleaned = re.sub(r'^[-*+]\s*', '', line_str)
                acceptance_criteria.append(f"- {cleaned}")

        issues.append({
            "title": title,
            "difficulty": difficulty.strip(),
            "timeline": timeline.strip(),
            "overview": feature_overview.strip(),
            "reqs": impl_requirements,
            "specs": tech_specs,
            "criteria": acceptance_criteria
        })

    return issues

def build_body(issue):
    title = issue["title"]
    category = "general"
    if "[Backend]" in title:
        category = "backend"
    elif "[Frontend]" in title:
        category = "frontend"
    elif "[Smart Contract]" in title:
        category = "smart contract"

    difficulty_desc = f"{issue['difficulty']} - Requires understanding of {category} development."
    reqs_str = "\n".join(issue['reqs'])
    specs_str = "\n".join(issue['specs'])
    criteria_str = "\n".join(issue['criteria'])

    body = f"""## 🚀 Feature Overview

{issue['overview']}

This is an essential, MVP-critical feature designed to take Web3 Student Lab's curriculum layer to a dynamic, production-ready level.

## 🛠️ Implementation Requirements

{reqs_str}

## 🔧 Technical Specifications

{specs_str}

## ✅ Acceptance Criteria

{criteria_str}

## 🎓 Difficulty Level

{difficulty_desc}

## ⏱️ Timeline

ETA: {issue['timeline']}"""
    return body

def get_labels(issue):
    labels = ["Stellar Wave"]
    title_lower = issue["title"].lower()
    overview_lower = issue["overview"].lower()

    # Track classification
    if "[backend]" in title_lower:
        labels.append("backend")
    elif "[frontend]" in title_lower:
        labels.append("frontend")
    elif "[smart contract]" in title_lower:
        labels.append("smart-contract")
        labels.append("rust")
        labels.append("soroban")

    # Keyword tags
    if "database" in title_lower or "prisma" in title_lower or "database" in overview_lower:
        labels.append("database")
    if "test" in title_lower or "benchmark" in title_lower or "test" in overview_lower:
        labels.append("testing")
    if "cache" in title_lower or "redis" in title_lower:
        labels.append("caching")
    if "multisig" in title_lower or "multi-sig" in title_lower:
        labels.append("multi-sig")
    if "timelock" in title_lower or "vesting" in title_lower or "lock" in title_lower:
        labels.append("timelock")
    if "oracle" in title_lower or "price feed" in title_lower:
        labels.append("oracle")
    if "proxy" in title_lower:
        labels.append("proxy")
    if "amm" in title_lower or "marketplace" in title_lower or "swap" in title_lower or "pool" in title_lower:
        labels.append("marketplace")
    if "storage" in title_lower or "storage" in overview_lower:
        labels.append("storage")
    if "analytics" in title_lower or "analytics" in overview_lower:
        labels.append("analytics")
    if "monaco" in title_lower or "editor" in title_lower or "playground" in title_lower:
        labels.append("debugging-tools")

    # Difficulty classification
    if "easy" in issue["difficulty"].lower() or "good first issue" in issue["difficulty"].lower():
        labels.append("good first issue")

    return list(set(labels))

def main():
    filepath = "/home/knights/.gemini/antigravity/brain/9bda9fc5-5386-4038-85b7-b4e80e44fc0e/proposed_30_more_issues.md"
    print(f"Parsing issues from {filepath}...")
    issues = parse_issues(filepath)
    print(f"Successfully parsed {len(issues)} issues.")

    # Clear GITHUB_TOKEN to force keyring authentication
    env = os.environ.copy()
    env["GITHUB_TOKEN"] = ""

    for i, issue in enumerate(issues, 1):
        title = issue["title"]
        body = build_body(issue)
        labels = get_labels(issue)
        labels_str = ",".join(labels)

        print(f"Creating issue {i}/{len(issues)}: {title} (labels: {labels_str})...")

        # Construct gh command to create issue with all labels
        cmd = [
            "gh", "issue", "create",
            "--title", title,
            "--body", body,
            "--label", labels_str
        ]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode == 0:
            url = result.stdout.strip()
            print(f"✓ Created: {url}")
        else:
            print(f"✗ Failed to create issue '{title}': {result.stderr.strip()}")

    print("✅ All 30 issues created successfully!")

if __name__ == "__main__":
    main()
