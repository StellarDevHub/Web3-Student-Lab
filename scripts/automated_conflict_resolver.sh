#!/bin/bash

# Automated conflict resolver for Web3 Student Lab PRs

# List of conflicted PRs and their branch names
PRS=(
  "441 feat/issue-379-token-buyback-program"
  "442 Impl-gaming-item-validation"
  "443 feat-implement-smart-contract-wallet-with-account-abstraction-and-ga"
  "444 Decentralized-payment-logic"
  "445 feat-create-on-chain-reward-points-system-with-token-conversion-and"
  "449 feat-add-Soroban-Monaco-support"
  "454 feat-build-decentralized-crowdfunding-with-milestone-based-fund-rele"
  "455 feat-Create-Subscription-Management-Contract-with-Recurring-Payments-and-Usage-Analytics"
  "457 Feat-405-Frontend-Contract-Build-Token-Airdrop-Manager-with-Merkle-Tree-Distribution-and-Anti-Sybil-Protection"
  "459 Feat-406-Frontend-Contract-Create-Decentralized-Blogging-Platform-with-Content-Ownership-and-Tip-Monetization"
  "460 Implement-Advanced-Circuit-Breaker-for-3rd-party-API-resiliency"
)

# Change to the repository directory
CDIR="/home/knights/Documents/Drips Miantainer Project/Web3 Student Lab"
cd "$CDIR" || { echo "Failed to change to directory $CDIR"; exit 1; }

echo "Starting automated conflict resolution..."

# Fetch latest main
echo "Fetching latest main branch..."
git fetch origin main

# Process each PR
for pr_info in "${PRS[@]}"; do
  read -r PR_NUM BRANCH_NAME <<< "$pr_info"

  echo "\n--- Processing PR #$PR_NUM (branch: $BRANCH_NAME) ---"

  # Try to fetch the branch
  echo "Fetching branch $BRANCH_NAME..."
  if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
    git fetch origin "$BRANCH_NAME:$BRANCH_NAME"
  else
    echo "Branch $BRANCH_NAME not found on remote. Skipping..."
    continue
  fi

  # Checkout the branch
  echo "Checking out branch $BRANCH_NAME..."
  git checkout "$BRANCH_NAME"

  # Try to rebase onto main
  echo "Rebasing $BRANCH_NAME onto main..."
  if git rebase origin/main; then
    echo "Successfully rebased $BRANCH_NAME onto main"
    git push origin "$BRANCH_NAME"
  else
    echo "Conflict detected in $BRANCH_NAME. Resolving automatically..."

    # Check if contracts/src/lib.rs has conflicts
    if git status --porcelain | grep -q "contracts/src/lib.rs"; then
      echo "Resolving contracts/src/lib.rs conflicts..."

      # Get current modules from main branch
      MAIN_MODULES=$(git show origin/main:contracts/src/lib.rs | grep "pub mod " | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')

      # Add missing modules for this PR
      case $PR_NUM in
        441) MODULES="token_buyback" ;;
        442) MODULES="gaming_validation" ;;
        443) MODULES="smart_wallet" ;;
        444) MODULES="payment_logic" ;;
        445) MODULES="reward_points" ;;
        449) MODULES="monaco_support" ;;
        454) MODULES="crowdfunding" ;;
        455) MODULES="subscription_management" ;;
        457) MODULES="token_airdrop" ;;
        459) MODULES="blogging_platform" ;;
        460) MODULES="circuit_breaker" ;;
        *) MODULES="" ;;
      esac

      if [ -n "$MODULES" ]; then
        echo "Adding module: $MODULES"
        # Add the module declaration after the last pub mod line
        sed -i "/pub mod [a-zA-Z_]+;/a pub mod $MODULES;" contracts/src/lib.rs
      fi

      # Mark conflict as resolved
      git add contracts/src/lib.rs
      git rebase --continue

      if [ $? -eq 0 ]; then
        echo "Successfully resolved conflicts for $BRANCH_NAME"
        git push origin "$BRANCH_NAME"
      else
        echo "Failed to resolve conflicts for $BRANCH_NAME"
      fi
    else
      echo "No contracts/src/lib.rs conflicts detected. Manual resolution needed."
    fi
  fi
done

echo "\nAutomated conflict resolution completed!"
