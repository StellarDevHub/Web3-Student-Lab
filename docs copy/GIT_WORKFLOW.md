# 🐙 Git Workflow & Contribution Guide

Welcome to the Web3 Student Lab! To keep our codebase clean, professional, and easy to maintain, we
follow a standardized Git workflow. Whether you are a first-time contributor or an experienced
developer, please follow these steps.

## 1. Local Environment Setup

Before you start coding, ensure your local repository is synced with the main project.

````bash
# 1. Fork the repository via the GitHub UI
# 2. Clone your fork locally
git clone [https://github.com/](https://github.com/)<YOUR_USERNAME>/Web3-Student-Lab.git
cd Web3-Student-Lab

# 3. Add the main repository as 'upstream'
git remote add upstream [https://github.com/StellarDevHub/Web3-Student-Lab.git](https://github.com/StellarDevHub/Web3-Student-Lab.git)

Branching Strategy
Never work directly on the main or master branch. Always create a new branch for your specific issue.

Use the following naming conventions for your branches:

feat/<issue-number>-<short-description> (for new features)

fix/<issue-number>-<short-description> (for bug fixes)

docs/<issue-number>-<short-description> (for documentation updates)

Example:

Bash
# Sync with upstream before branching
git checkout master
git pull upstream master

# Create and switch to your new branch
git checkout -b feat/42-add-wallet-connect

Commit Message Standards
We strictly follow Conventional Commits. This helps us automatically generate changelogs and maintain a readable history.

Format: <type>: <description>

Allowed Types:

feat: A new feature

fix: A bug fix

docs: Documentation only changes

style: Changes that do not affect the meaning of the code (formatting, etc)

refactor: A code change that neither fixes a bug nor adds a feature

test: Adding missing tests or correcting existing tests

Examples of Good Commits:
✅ feat: add Soroban smart contract playground UI
✅ fix: resolve overflow error in transaction simulator
✅ docs: update setup instructions in README

Examples of Bad Commits:
❌ fixed bug
❌ wip
❌ added some files

4. Submitting a Pull Request (PR)
Once your implementation is complete and tested:

Commit your changes:

Bash
git add .
git commit -m "feat: implement hackathon project generator"
Push to your fork:

Bash
git push origin <your-branch-name>
Open a Pull Request:

Go to the original Web3 Student Lab repository.

Click Compare & pull request.

Fill out the provided PR template.

Crucial: Include Closes #<issue-number> in your PR description so GitHub automatically links and closes the issue when merged.


---

### Step 2: Update `CONTRIBUTING.md`
To ensure students actually read the new guide, we need to update the existing `CONTRIBUTING.md`. We will keep it minimal to respect the existing structure.

**File:** `CONTRIBUTING.md`
**Action:** Replace the content under **"2. Fork & create a branch"** with the following:

```markdown
## 2. Fork & create a branch

If this is something you think you can fix, then fork Web3 Student Lab and create a branch with a descriptive name.

🚨 **Important:** Please read our detailed **[Git Workflow & Contribution Guide](d
````
