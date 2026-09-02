# Web3 Student Lab 🎓⛓️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

**Web3 Student Lab** is an open-source educational platform that helps students learn blockchain, smart contracts, open-source collaboration, and hackathon project development in one place.

The platform provides **interactive tools, coding environments, and guided learning paths** designed for beginners and university students.

## 🟢 Live Deployment

The application is fully deployed and accessible online:

- **Frontend Application**: [https://web3-student-lab.vercel.app/](https://web3-student-lab.vercel.app/)
- **Backend Infrastructure**: Hosted securely on Render using PostgreSQL, Redis, and integrated with the Stellar/Soroban Testnet.
- **Smart Contracts**: My contract is deployed!

## 🚀 Core Modules

1. **Blockchain Learning Simulator**: Visually learn how blockchains work (create transactions, mine
   blocks, view hashes, and see how blocks connect).
2. **Smart Contract Playground**: Write, run, and test smart contracts directly in your browser.
   Focuses on Soroban contracts written in Rust.
3. **Web3 Learning Roadmap**: A guided path spanning programming fundamentals, cryptography,
   blockchain architecture, smart contracts, and full Web3 applications.
4. **Hackathon Project Idea Generator**: Overcome coder's block by generating ideas based on
   technology and sector preferences.
5. **Open Source Contribution Trainer**: Get hands-on with Git, simulated GitHub issues, PR
   exercises, and decentralized identity verification that attaches DID-backed contributor proof to
   saved training submissions.

## 🛠 Technology Stack

**Frontend**

- React / Next.js
- Tailwind CSS
- Monaco Editor
- WebAuthn API (Passkeys)

**Backend**

- Node.js / Express
- PostgreSQL
- Redis (Challenge Storage)

**Blockchain Integration**

- Stellar SDK
- Soroban Smart Contracts
- Soroban Rust SDK `26.1.0` for every contract crate and browser-generated Cargo manifest

## 📁 Repository Structure

```text
web3-student-lab/
├── contracts/            # Soroban Cargo workspace (see docs/contracts/WORKSPACE.md)
├── frontend/             # Next.js/React frontend application
├── backend/              # Node.js backend application
├── scripts/              # Development automation scripts and test payloads
└── docs/                 # Documentation and learning materials
```

### ⚡ Development Automation Scripts (`scripts/`)

All automated generators, environment setup scripts, and payload tooling reside in `scripts/`:

| Script / Artifact | Description | Usage |
| ----------------- | ----------- | ----- |
| `scripts/generate_issues.py` | Generates structured Markdown issue sets (`70_new_issues.md`) | `python3 scripts/generate_issues.py` |
| `scripts/generate_gh_payload.py` | Generates GitHub REST API issue payloads (`github_issues_payload.json`) | `python3 scripts/generate_gh_payload.py` |
| `scripts/setup-local-node.sh` | Spins up local Stellar/Soroban standalone node | `bash scripts/setup-local-node.sh` |
| `scripts/deploy-subscription-system.sh` | Deploys Soroban subscription system contracts | `bash scripts/deploy-subscription-system.sh` |

## 👥 Local Development

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose (for PostgreSQL/Redis)
- Rust toolchain (for smart contracts)
- Stellar CLI

### Infrastructure (Docker Compose)

Most day-to-day work only needs **PostgreSQL + standalone Redis**. Prefer the development override so Sentinel and Cluster nodes are not started:

```bash
# Recommended for development (PostgreSQL + standalone Redis only)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Other compose profiles:

```bash
# Full stack (PostgreSQL, Redis, Sentinels, Cluster, backend) — production-like testing
docker compose -f docker-compose.yml up -d

# High-availability Redis testing (Sentinel / Cluster wired for the backend)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full stack: Postgres, Redis, Sentinels, Cluster, backend |
| `docker-compose.dev.yml` | Dev override: Postgres + standalone Redis only |
| `docker-compose.prod.yml` | HA override: Sentinel/Cluster-oriented backend config |

Stop services with `docker compose down` (pass the same `-f` flags you used to start).

## 🔐 MVP Update: Decentralized Identity Verification

The Open Source Contribution Trainer now includes decentralized identity verification for contributor
workflows in `frontend/src/app/version-control/page.tsx`.

- Contributors link a DID, Stellar wallet address, and GitHub handle before saving a verified
  trainer version.
- Verified saves persist proof metadata in the version history engine at
  `frontend/src/lib/version-control/engine.ts`.
- Core attestation creation and verification logic lives in
  `frontend/src/lib/open-source-trainer/identity.ts`.

## 🤝 Contributing

We love our contributors! This project is being built for students, by students and open-source enthusiasts.

To start contributing:

1. Read our [Contribution Guidelines](CONTRIBUTING.md).
2. Check out our existing [Issues](https://github.com/your-repo/issues) or look for the `good first issue` label.
3. Fork the repository and submit a Pull Request!

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
