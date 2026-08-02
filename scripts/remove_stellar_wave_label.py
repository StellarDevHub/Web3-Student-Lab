#!/usr/bin/env python3
import subprocess
import json
import os

def main():
    # Force keyring authentication by unsetting GITHUB_TOKEN environment variable if it's invalid
    env = os.environ.copy()
    env["GITHUB_TOKEN"] = ""
    
    # Get all issues with the Stellar Wave label
    cmd = ["gh", "issue", "list", "-l", "Stellar Wave", "-L", "100", "--json", "number"]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error listing issues: {result.stderr}")
        return
        
    issues = json.loads(result.stdout)
    print(f"Found {len(issues)} issues with the 'Stellar Wave' label.")
    
    for i, issue in enumerate(issues, 1):
        num = issue["number"]
        print(f"[{i}/{len(issues)}] Removing label from issue #{num}...")
        edit_cmd = ["gh", "issue", "edit", str(num), "--remove-label", "Stellar Wave"]
        edit_res = subprocess.run(edit_cmd, env=env, capture_output=True, text=True)
        if edit_res.returncode == 0:
            print(f"✓ Removed 'Stellar Wave' from #{num}")
        else:
            print(f"✗ Failed for #{num}: {edit_res.stderr.strip()}")
            
    print("Done!")

if __name__ == "__main__":
    main()
