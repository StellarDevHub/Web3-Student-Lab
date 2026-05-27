#!/bin/bash

# Script to comment on all PRs with the message
# "pr under review, if i find any wrong implementation i will notify you."

# Get list of PR numbers
PR_NUMBERS=($(gh pr list --limit 100 --state all --repo StellarDevHub/Web3-Student-Lab --json number | jq -r '.[].number'))

COMMENT="pr under review, if i find any wrong implementation i will notify you."

echo "Found ${#PR_NUMBERS[@]} PRs to comment on"
echo "Commenting on PRs..."

# Process PRs in batches of 10 to avoid rate limiting
BATCH_SIZE=10
for ((i=0; i<${#PR_NUMBERS[@]}; i+=BATCH_SIZE)); do
    echo "Processing batch starting at index $i"
    for ((j=i; j<i+BATCH_SIZE && j<${#PR_NUMBERS[@]}; j++)); do
        PR_NUM=${PR_NUMBERS[j]}
        echo "Commenting on PR #$PR_NUM"
        gh pr comment "$PR_NUM" --body "$COMMENT" --repo StellarDevHub/Web3-Student-Lab
        # Add small delay between comments to be respectful
        sleep 1
    done
    echo "Completed batch $((i/BATCH_SIZE + 1))"
done

echo "All PRs commented on successfully!"
