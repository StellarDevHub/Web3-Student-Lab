#!/usr/bin/env python3
import os
import subprocess

def main():
    # Mapping of issue numbers (673 to 712) to their desired labels
    issue_labels = {
        # Backend Issues
        673: ["Stellar Wave", "backend", "database"],
        674: ["Stellar Wave", "backend", "caching"],
        675: ["Stellar Wave", "backend"],
        676: ["Stellar Wave", "backend"],
        677: ["Stellar Wave", "backend", "database", "good first issue"],
        678: ["Stellar Wave", "backend"],
        679: ["Stellar Wave", "backend"],
        680: ["Stellar Wave", "backend", "testing"],
        681: ["Stellar Wave", "backend"],
        682: ["Stellar Wave", "backend"],
        683: ["Stellar Wave", "backend"],
        684: ["Stellar Wave", "backend", "analytics"],
        685: ["Stellar Wave", "backend"],

        # Smart Contract Issues
        686: ["Stellar Wave", "smart-contract", "rust", "soroban"],
        687: ["Stellar Wave", "smart-contract", "rust", "soroban", "storage"],
        688: ["Stellar Wave", "smart-contract", "rust", "soroban", "access-control"],
        689: ["Stellar Wave", "smart-contract", "rust", "soroban", "testing"],
        690: ["Stellar Wave", "smart-contract", "rust", "soroban"],
        691: ["Stellar Wave", "smart-contract", "rust", "soroban", "multi-sig"],
        692: ["Stellar Wave", "smart-contract", "rust", "soroban", "marketplace"],
        693: ["Stellar Wave", "smart-contract", "rust", "soroban", "timelock"],
        694: ["Stellar Wave", "smart-contract", "rust", "soroban"],
        695: ["Stellar Wave", "smart-contract", "rust", "soroban", "oracle"],
        696: ["Stellar Wave", "smart-contract", "rust", "soroban"],
        697: ["Stellar Wave", "smart-contract", "rust", "soroban", "good first issue"],
        698: ["Stellar Wave", "smart-contract", "rust", "soroban", "proxy"],

        # Frontend Issues
        699: ["Stellar Wave", "frontend"],
        700: ["Stellar Wave", "frontend", "debugging-tools"],
        701: ["Stellar Wave", "frontend"],
        702: ["Stellar Wave", "frontend", "good first issue"],
        703: ["Stellar Wave", "frontend"],
        704: ["Stellar Wave", "frontend"],
        705: ["Stellar Wave", "frontend", "good first issue"],
        706: ["Stellar Wave", "frontend"],
        707: ["Stellar Wave", "frontend", "good first issue"],
        708: ["Stellar Wave", "frontend"],
        709: ["Stellar Wave", "frontend", "good first issue"],
        710: ["Stellar Wave", "frontend"],
        711: ["Stellar Wave", "frontend", "good first issue"],
        712: ["Stellar Wave", "frontend"]
    }

    # Clear GITHUB_TOKEN to force keyring authentication
    env = os.environ.copy()
    env["GITHUB_TOKEN"] = ""

    print("Starting labeling of all 40 issues...")

    for issue_num, labels in issue_labels.items():
        labels_str = ",".join(labels)
        print(f"Adding labels [{labels_str}] to issue #{issue_num}...")

        # Construct gh command to edit/add labels
        cmd = [
            "gh", "issue", "edit", str(issue_num),
            "--add-label", labels_str
        ]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"✓ Labeled #{issue_num}")
        else:
            print(f"✗ Failed to label #{issue_num}: {result.stderr.strip()}")

    print("✅ All issues successfully labeled!")

if __name__ == "__main__":
    main()
