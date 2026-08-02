# PR Preview Site Configuration

This document compares automated preview deployment options for every Pull Request in the
**Web3-Student-Lab** project and recommends the best approach for a student environment.

---

## Why PR Previews Matter

Pull Request preview deployments give every contributor a live, shareable URL for their branch — no
local setup required. Reviewers can test UI changes, check responsiveness, and catch regressions
before merging. For a student project, this dramatically lowers the feedback loop and makes code
review more visual and accessible.

---

## Options Compared

### 1. Vercel

**How it works:** Connect your GitHub repo once. Vercel automatically builds and deploys every PR to
a unique URL (e.g., `web3-student-lab-pr-42.vercel.app`). The GitHub integration posts the URL
directly in the PR comment.

**Pros:**

- Zero configuration for most frameworks (Next.js, Vite, CRA, plain HTML)
- Free Hobby plan covers unlimited preview deployments for public repos
- Instant HTTPS, global CDN, and automatic teardown when PR closes
- GitHub bot comments the preview link automatically
- Supports environment variables per branch

**Cons:**

- Free tier limits team size (1 person on Hobby; upgrade needed for org-wide access)
- Build minutes are capped on free plans (though generous for small projects)
- Vendor lock-in — some Vercel-specific features don't translate elsewhere

**Setup complexity:** Very low — ~5 minutes to connect repo and go live.

---

### 2. Netlify

**How it works:** Similar to Vercel. Netlify watches your repo and builds a "Deploy Preview" for
each PR. The preview URL appears as a GitHub status check.

**Pros:**

- Free Starter plan includes Deploy Previews for public repos
- Supports a wide range of build tools (same as Vercel)
- Netlify CMS and Forms are available if needed later
- Branch-level environment variables
- Easy rollback to any previous deploy

**Cons:**

- 300 build minutes/month on the free plan (can be tight with active contributors)
- Slightly more configuration needed compared to Vercel for some frameworks
- Team collaboration features are paywalled

**Setup complexity:** Low — ~10 minutes with the GitHub app.

---

### 3. GitHub Pages + GitHub Actions (Self-Hosted Previews)

**How it works:** A custom GitHub Actions workflow builds the project on every PR push and deploys
to a `gh-pages`-style branch or uploads to an S3-compatible bucket / GitHub Pages subfolder.

**Pros:**

- Fully free with no external service dependency
- Complete control over the build and deploy pipeline
- Keeps everything within the GitHub ecosystem
- Good learning opportunity for CI/CD fundamentals

**Cons:**

- Significantly more setup and maintenance work
- GitHub Pages does not natively support per-PR URLs — workarounds (subfolders, artifacts) are
  fragile
- No automatic teardown of old previews without extra scripting
- Debugging pipeline failures can be time-consuming for students

**Setup complexity:** High — requires writing and maintaining a custom Actions workflow.

---

### 4. Cloudflare Pages

**How it works:** Cloudflare Pages connects to GitHub and deploys previews on every PR push, similar
to Vercel and Netlify, but served from Cloudflare's edge network.

**Pros:**

- Extremely generous free tier (unlimited requests, unlimited bandwidth)
- Fast global edge delivery
- No build minute caps

**Cons:**

- Build times can be slower than Vercel/Netlify
- Less mature GitHub integration (preview comments require manual setup)
- Ecosystem tooling is less polished for student onboarding

**Setup complexity:** Low-to-medium — ~15 minutes.

---

## Comparison Table

| Feature                           | Vercel   | Netlify   | GitHub Actions | Cloudflare Pages |
| --------------------------------- | -------- | --------- | -------------- | ---------------- |
| Free PR previews                  | ✅       | ✅        | ✅ (manual)    | ✅               |
| Auto PR comment with URL          | ✅       | ✅        | ⚠️ (scripted)  | ⚠️ (partial)     |
| Zero config for common frameworks | ✅       | ✅        | ❌             | ✅               |
| Auto teardown on PR close         | ✅       | ✅        | ❌             | ✅               |
| Build minutes (free)              | Generous | 300/month | 2000 min/month | Unlimited        |
| Setup time                        | ~5 min   | ~10 min   | 1–3 hours      | ~15 min          |
| Best for learning CI/CD           | ❌       | ❌        | ✅             | ❌               |

---

## Recommendation: Vercel

For **Web3-Student-Lab**, **Vercel** is the recommended choice.

**Reasons:**

1. **Fastest time to value.** Students can get PR previews working in under 5 minutes with no
   configuration files. This keeps the focus on learning Web3 concepts, not DevOps.

2. **Best-in-class GitHub integration.** Vercel's GitHub bot automatically comments preview URLs on
   every PR — reviewers never have to hunt for a link.

3. **Free for public repos.** The Hobby plan covers everything this project needs. There are no
   build minute caps that would block contributors during active sprints.

4. **Framework agnostic.** Whether the project uses plain HTML, React, or a Web3 framework like
   scaffold-eth, Vercel detects and builds it correctly.

5. **Automatic cleanup.** Preview deployments are torn down when a PR is closed or merged, keeping
   the environment tidy.

Netlify is a solid runner-up and can be substituted if the team hits Vercel's free-tier team-size
limits. GitHub Actions is worth exploring later as a learning exercise in CI/CD, but should not be
the first choice here due to its setup complexity.

---

## Setup Instructions (Vercel)

### Step 1 — Connect the Repository

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account.
2. Click **Add New → Project**.
3. Import the `StellarDevHub/Web3-Student-Lab` repository.
4. Accept the default build settings (Vercel auto-detects the framework).
5. Click **Deploy**.

### Step 2 — Enable GitHub Integration

Vercel installs a GitHub App automatically during the import. This app:

- Triggers a build on every push to any branch
- Posts a preview URL as a PR comment and status check
- Marks the check as failed if the build errors out

No additional configuration is needed.

### Step 3 — Environment Variables (if needed)

If the project uses environment variables (e.g., RPC endpoints, contract addresses):

1. Go to **Project Settings → Environment Variables** in the Vercel dashboard.
2. Add each variable and scope it to **Preview** (and optionally **Production**).
3. Mark sensitive values (private keys, API secrets) as **Encrypted**.

> ⚠️ Never commit `.env` files or private keys to the repository.

### Step 4 — Verify a Preview

1. Open a new branch and push a small change.
2. Create a Pull Request on GitHub.
3. Within ~1–2 minutes, a bot comment should appear with a URL like:
   ```
   ✅ Preview deployed → https://web3-student-lab-git-<branch>.vercel.app
   ```
4. Open the link to confirm the preview renders correctly.

---

## Workflow for Contributors

When you open a PR:

- A preview deployment starts automatically — no action needed.
- The preview URL is posted as a comment and a green/red status check.
- Every new push to the PR branch triggers a fresh preview build.
- When the PR is merged or closed, the preview is removed automatically.

To link to a preview in your PR description, copy the URL from the Vercel bot comment.

---

## References

- [Vercel Preview Deployments docs](https://vercel.com/docs/deployments/preview-deployments)
- [Netlify Deploy Previews docs](https://docs.netlify.com/site-deploys/deploy-previews/)
- [Cloudflare Pages Preview Deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [GitHub Actions deployment examples](https://github.com/actions/deploy-pages)
