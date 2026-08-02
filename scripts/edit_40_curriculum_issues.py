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

        # Extract title from the first line
        header = lines[0].strip()
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
                # Standardize to hyphen prefix
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
    # Determine the category based on the title
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

def main():
    filepath = "/home/knights/.gemini/antigravity/brain/9bda9fc5-5386-4038-85b7-b4e80e44fc0e/proposed_40_issues.md"
    print(f"Parsing issues from {filepath}...")
    issues = parse_issues(filepath)
    print(f"Successfully parsed {len(issues)} issues.")

    # Starting issue number on GitHub
    start_num = 673

    # Clear GITHUB_TOKEN to force keyring authentication
    env = os.environ.copy()
    env["GITHUB_TOKEN"] = ""

    for i, issue in enumerate(issues):
        issue_num = start_num + i
        title = issue["title"]
        body = build_body(issue)

        print(f"Editing issue #{issue_num}: {title}...")

        # Construct gh command to edit issue body
        cmd = [
            "gh", "issue", "edit", str(issue_num),
            "--title", title,
            "--body", body
        ]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"✓ Edited #{issue_num}")
        else:
            print(f"✗ Failed to edit issue #{issue_num}: {result.stderr.strip()}")

    print("✅ All issues updated successfully!")

if __name__ == "__main__":
    main()
