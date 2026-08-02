# Web3 Student Lab 🎓⛓️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

**Web3 Student Lab** is an open-source educational platform that helps students learn blockchain,
smart contracts, open-source collaboration, and hackathon project development in one place.

The platform provides **interactive tools, coding environments, and guided learning paths** designed
for beginners and university students.

## � Frequently Asked Questions

- New contributors with environment issues can start here: [docs/FAQ.md](docs/FAQ.md)

## �🚀 Core Modules

1. **Blockchain Learning Simulator**: Visually learn how blockchains work (create transactions, mine
   blocks, view hashes, and see how blocks connect).
2. **Smart Contract Playground**: Write, run, and test smart contracts directly in your browser.
   Focuses on Soroban contracts written in Rust.
3. **Web3 Learning Roadmap**: A guided path spanning programming fundamentals, cryptography,
   blockchain architecture, smart contracts, and full Web3 applications.
4. **Hackathon Project Idea Generator**: Overcome coder's block by generating ideas based on
   technology and sector preferences.
5. **Open Source Contribution Trainer**: Get hands-on with Git, simulated GitHub issues, and PR
   exercises to confidently contribute to open source.

## 🛠 Technology Stack

**Frontend**

- React / Next.js
- Tailwind CSS
- Monaco Editor

**Backend**

- Node.js / Express
- PostgreSQL

**Blockchain Integration**

- Stellar SDK
- Soroban Smart Contracts

## 🗺️ Visual Roadmap & Milestones

```mermaid
timeline
    title Web3 Student Lab - Development Timeline
    Phase 1: Discovery : Architecture Planning : Concept Validation : UI/UX Wireframing
    Phase 2: Development : Core Modules Build : Smart Contract Playground : Backend Integration
    Phase 3: Deployment : MVP Launch : Beta Testing : University Outreach
```

### Phase 1: Discovery 🔍

**Objective:** Define the core platform architecture, validate learning mechanisms, and design the
initial curriculum.

- **Milestones:**
  - [x] Initial repository setup and architecture planning
  - [ ] Define Soroban/Stellar learning roadmap
  - [ ] UI/UX wireframes for the Blockchain Simulator

### Phase 2: Development 🛠️

**Objective:** Build out the core modules, integrate blockchain functionalities, and develop the
interactive playground.

- **Milestones:**
  - [ ] Implement Next.js + Tailwind frontend
  - [ ] Integrate Monaco Editor for Smart Contract Playground
  - [ ] Set up PostgreSQL and Node.js backend infrastructure

### Phase 3: Deployment 🚀

**Objective:** Launch the MVP, onboard the first cohort of students, and gather metrics for future
iterations.

- **Milestones:**
  - [ ] Deploy backend and database to cloud infrastructure
  - [ ] Host the frontend application
  - [ ] Open the platform for beta testing

## 📁 Repository Structure

```text
web3-student-lab/
├── contracts/            # Platform smart contracts (e.g., on-chain certificates)
├── frontend/             # Next.js/React frontend application
│   ├── simulator/        # Visual blockchain tools
│   ├── playground/       # In-browser smart contract editor
│   ├── roadmap/          # Learning progress tracking and paths
│   └── ideas/            # Hackathon project generator UI
├── backend/              # Node.js backend application
│   ├── blockchain/       # Interaction with Stellar/Soroban
│   ├── contracts/        # Compilation and execution engine for student code
│   ├── learning/         # Curriculum and progress APIs
│   └── generator/        # Prompt/AI layer for hackathon ideas
└── docs/                 # Documentation and learning materials
```

## 🚀 Setup Guide

This repository is a monorepo with three main parts:

- `frontend/` for the Next.js application
- `backend/` for the Express + Prisma API
- `contracts/` for Soroban smart contracts written in Rust

You can work on the web app with Node.js alone, but you will need Rust and the Soroban CLI to
build or test the smart contracts.

### Prerequisites

Install these tools before starting:

- **Node.js**: version 20 LTS or newer
- **npm**: included with Node.js
- **Rust**: stable toolchain installed with `rustup`
- **Soroban CLI**: for building, testing, and deploying contracts
- **PostgreSQL 15+** or **Docker Compose**: for the backend database

### 1. Install Node.js

Download Node.js from the official website:

- [https://nodejs.org/en/download](https://nodejs.org/en/download)

Verify your installation:

```bash
node --version
npm --version
```

### 2. Install Rust

Install Rust with `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your terminal, then verify:

```bash
rustc --version
cargo --version
```

Add the WebAssembly target required for Soroban contracts:

```bash
rustup target add wasm32-unknown-unknown
```

### 3. Install Soroban CLI

Install the Soroban CLI with Cargo:

```bash
cargo install --locked soroban-cli
```

Verify the installation:

```bash
soroban --version
```

For a beginner-friendly Soroban walkthrough, see [SOROBAN_GUIDE.md](SOROBAN_GUIDE.md).

### 4. Clone the Repository

```bash
git clone https://github.com/StellarDevHub/Web3-Student-Lab.git
cd Web3-Student-Lab
```

### 5. Install Project Dependencies

Install all JavaScript dependencies from the project root:

```bash
npm run install-all
```

If you prefer to install packages manually:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 6. Configure Environment Variables

Create the backend environment file at `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/web3-student-lab?schema=public"
PORT=8080
NODE_ENV=development
JWT_SECRET=change-this-in-development
```

Create the frontend environment file at `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=
```

### 7. Start the Database

Choose one of the following options.

#### Option A: Use Docker Compose

From the project root:

```bash
docker compose up -d db
```

This starts PostgreSQL on `localhost:5432`.

#### Option B: Use a Local PostgreSQL Instance

Create a database named `web3-student-lab`, then make sure your `DATABASE_URL` in
`backend/.env` matches your local PostgreSQL username and password.

### 8. Prepare the Backend Database

From the `backend/` directory:

```bash
npx prisma generate
npx prisma migrate deploy
```

If you want seed data and the project requires it:

```bash
npx prisma db seed
```

### 9. Run the Applications

Run the backend:

```bash
cd backend
npm run dev
```

In a second terminal, run the frontend:

```bash
cd frontend
npm run dev
```

Or run both from the project root:

```bash
npm run dev-all
```

You can then access:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`
- Health check: `http://localhost:8080/health`

### 10. Build and Test the Soroban Contracts

From the `contracts/` directory, run:

```bash
cargo test
cargo build --target wasm32-unknown-unknown --release
```

This will validate the Rust contracts and produce a WASM build for deployment.

### Quick Verification Checklist

Use these commands to confirm your setup is working:

```bash
node --version
rustc --version
soroban --version
cd backend && npm test
cd ../contracts && cargo test
```

## 🐳 Getting Started with Docker

The easiest way to set up the local development environment (backend and database) is using Docker
Compose.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Launching the Environment

1. Clone the repository and navigate to the root directory.
2. Run the following command:
   ```bash
   docker compose up --build
   ```
3. The backend will be available at `http://localhost:8080`.
4. The PostgreSQL database will be accessible at `localhost:5432`.

### Useful Commands

- **Stop the environment**: `docker compose down`
- **View logs**: `docker compose logs -f`
- **Restart a specific service**: `docker compose restart backend`

## 🤝 Rules for Contributors

We love our contributors! This project is being built for students, by students and open-source
enthusiasts.

> **Important:** Please add an ETA (no more than 2 days) when expressing interest in an issue to
> help us keep development moving quickly.

To start contributing:

1. Read our [Contribution Guidelines](CONTRIBUTING.md).
2. Review our [Security Best Practices](docs/SECURITY.md).
3. Read the [CI/CD Pipeline Guide](docs/CICD_GUIDE.md).
4. Check out our existing [Issues](https://github.com/your-repo/issues) or look for the
   `good first issue` label.
5. Fork the repository and submit a Pull Request!

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
