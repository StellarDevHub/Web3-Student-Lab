#!/bin/bash

# Script to resolve conflicts for PRs by rebasing onto main

# List of conflicted PRs and their branch names
PRS=(
  "421 feature/411-payment-scheduler"
  "422 Create-File-Notarization-System-with-Hash-Timestamping-and-Proof-of-Existence"
  "423 feature/decentralized-job-board-391"
  "424 feature/404-analytics-platform"
  "425 create-decentralized-blogging-platform"
  "426 content-ownership-and-tip-monitin"
  "427 job-board-with-skill-verification"
  "428 ISSUE-#252-FIX"
)

# Change to the repository directory
CDIR="/home/knights/Documents/Drips Miantainer Project/Web3 Student Lab"
cd "$CDIR" || { echo "Failed to change to directory $CDIR"; exit 1; }

echo "Resolving conflicts for PRs..."

# Fetch latest main
echo "Fetching latest main branch..."
git fetch origin main

# Process each PR
for pr_info in "${PRS[@]}"; do
  read -r PR_NUM BRANCH_NAME <<< "$pr_info"

  echo "\n--- Resolving conflicts for PR #$PR_NUM (branch: $BRANCH_NAME) ---"

  # Check if branch exists locally
  if git show-ref --verify --quiet refs/heads/$BRANCH_NAME; then
    echo "Branch $BRANCH_NAME exists locally, checking it out..."
    git checkout "$BRANCH_NAME"
  else
    echo "Branch $BRANCH_NAME doesn't exist locally, fetching from origin..."
    git fetch origin "$BRANCH_NAME:$BRANCH_NAME"
    git checkout "$BRANCH_NAME"
  fi

  # Try to rebase onto main
  echo "Rebasing $BRANCH_NAME onto main..."
  if git rebase origin/main; then
    echo "Successfully rebased $BRANCH_NAME onto main"

    # Push the updated branch
    echo "Pushing updated branch to origin..."
    git push --force-with-lease origin "$BRANCH_NAME"

    # Check if the PR is now mergeable
    echo "Checking PR #$PR_NUM status..."
    gh pr view "$PR_NUM" --repo StellarDevHub/Web3-Student-Lab --json number,mergeStateStatus,mergeable | jq -r '.number, .mergeStateStatus, .mergeable'
  else
    echo "ERROR: Failed to rebase $BRANCH_NAME onto main. Manual conflict resolution needed."
    echo "Please resolve conflicts manually and run 'git rebase --continue'"
    # Reset to avoid leaving in rebase state
    git rebase --abort 2>/dev/null || true
  fi
done

echo "\nConflict resolution process completed!"
