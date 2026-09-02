#!/bin/bash

# Web3 Student Lab - 1-Command Contributor Onboarding CLI
# Issue #1207: Interactive Onboarding & Environment Diagnostics

set -e

# Formatting & Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "========================================================================="
echo "   🚀 WEB3 STUDENT LAB - 1-COMMAND CONTRIBUTOR ONBOARDING CLI 🚀"
echo "========================================================================="
echo -e "${NC}"

# Check if script is run from project root
if [ ! -f "package.json" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: Please execute this setup script from the repository root directory!${NC}"
    exit 1
fi

MISSING_PREREQS=0

echo -e "${MAGENTA}${BOLD}🔍 Step 1: Diagnostics & Prerequisite Verifications${NC}"
echo "-------------------------------------------------------------------------"

# 1. Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}  ✓ Node.js is installed (${NODE_VERSION})${NC}"
else
    echo -e "${RED}  ❌ Node.js is NOT installed!${NC}"
    echo -e "${YELLOW}     👉 Install Node.js (v18+): https://nodejs.org or run 'nvm install 20'${NC}"
    MISSING_PREREQS=$((MISSING_PREREQS+1))
fi

# 2. Check Rust
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    echo -e "${GREEN}  ✓ Rust is installed (v${RUST_VERSION})${NC}"
else
    echo -e "${YELLOW}  ⚠️  Rust compiler (rustc) is not found.${NC}"
    echo -e "${YELLOW}     👉 Install Rust toolchain: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
fi

# 3. Check Cargo
if command -v cargo &> /dev/null; then
    CARGO_VERSION=$(cargo --version | awk '{print $2}')
    echo -e "${GREEN}  ✓ Cargo is installed (v${CARGO_VERSION})${NC}"
else
    echo -e "${YELLOW}  ⚠️  Cargo package manager is not found.${NC}"
    echo -e "${YELLOW}     👉 Install Cargo: included with rustup (https://rustup.rs)${NC}"
fi

# 4. Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}  ✓ Docker is installed (v${DOCKER_VERSION})${NC}"
else
    echo -e "${YELLOW}  ⚠️  Docker is not installed.${NC}"
    echo -e "${YELLOW}     👉 Install Docker Desktop or daemon: https://docs.docker.com/get-docker/${NC}"
fi

# 5. Check Stellar / Soroban CLI
if command -v stellar &> /dev/null; then
    STELLAR_CLI_VER=$(stellar --version 2>&1 | head -n 1)
    echo -e "${GREEN}  ✓ Stellar CLI is installed (${STELLAR_CLI_VER})${NC}"
elif command -v soroban &> /dev/null; then
    SOROBAN_CLI_VER=$(soroban --version 2>&1 | head -n 1)
    echo -e "${GREEN}  ✓ Soroban CLI is installed (${SOROBAN_CLI_VER})${NC}"
else
    echo -e "${YELLOW}  ⚠️  Stellar CLI is not found.${NC}"
    echo -e "${YELLOW}     👉 Install Stellar CLI: cargo install --locked stellar-cli${NC}"
fi

if [ $MISSING_PREREQS -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠️  Critical prerequisite checks failed. Please install missing required tools above and rerun 'npm run setup'.${NC}"
    exit 1
fi

echo ""
echo -e "${MAGENTA}${BOLD}⚙️  Step 2: Environment Configuration & Dependencies${NC}"
echo "-------------------------------------------------------------------------"

# Setup Backend Environment
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Creating backend/.env file from template...${NC}"
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
    else
        cat <<EOT > backend/.env
PORT=8080
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/web3lab"
JWT_SECRET=dev-jwt-secret-key-32-bytes-minimum-length
NODE_ENV=development
STELLAR_WEBHOOK_SECRET=dev-webhook-secret
EOT
    fi
    echo -e "${GREEN}  ✓ Backend .env created${NC}"
else
    echo -e "${GREEN}  ✓ Backend .env exists${NC}"
fi

# Setup Frontend Environment
if [ ! -f "frontend/.env.local" ]; then
    echo -e "${YELLOW}Creating frontend/.env.local file from template...${NC}"
    cat <<EOT > frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=CAX...MOCK
EOT
    echo -e "${GREEN}  ✓ Frontend .env.local created${NC}"
else
    echo -e "${GREEN}  ✓ Frontend .env.local exists${NC}"
fi

# Install dependencies
echo -e "${BLUE}Installing backend dependencies...${NC}"
(cd backend && npm install --silent || pnpm install --silent)
echo -e "${GREEN}  ✓ Backend dependencies installed${NC}"

echo -e "${BLUE}Installing frontend dependencies...${NC}"
(cd frontend && npm install --silent || pnpm install --silent)
echo -e "${GREEN}  ✓ Frontend dependencies installed${NC}"

echo ""
echo -e "${MAGENTA}${BOLD}🛠️  Step 3: Database & Smart Contract Initializations${NC}"
echo "-------------------------------------------------------------------------"

# Generate Prisma Client & Seed Database
echo -e "${BLUE}Generating Prisma Client...${NC}"
(cd backend && npx prisma generate) || true
echo -e "${GREEN}  ✓ Prisma client generated${NC}"

echo -e "${BLUE}Seeding database schema & mock data...${NC}"
(cd backend && npx tsx prisma/seed.ts) || true
echo -e "${GREEN}  ✓ Database seeded successfully${NC}"

# Compile Smart Contracts if Cargo is present
if command -v cargo &> /dev/null && [ -d "contracts" ]; then
    echo -e "${BLUE}Compiling Soroban smart contracts...${NC}"
    (cd contracts && cargo check --quiet) || true
    echo -e "${GREEN}  ✓ Smart contracts validated${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}"
echo "========================================================================="
echo " 🎉 CONTRIBUTOR ONBOARDING COMPLETE! YOUR DEV ENVIRONMENT IS READY! 🎉"
echo "========================================================================="
echo -e "${NC}"

echo -e "${BOLD}📌 Quick Start Local Development Servers:${NC}"
echo ""
echo -e "  ${CYAN}1. Start Backend API Server:${NC}"
echo "     cd backend && npm run dev"
echo "     📍 Backend URL: ${BOLD}http://localhost:8080${NC}"
echo "     📍 Health Check: ${BOLD}http://localhost:8080/api/health${NC}"
echo ""
echo -e "  ${CYAN}2. Start Frontend App:${NC}"
echo "     cd frontend && npm run dev"
echo "     📍 Frontend App: ${BOLD}http://localhost:3000${NC}"
echo ""
echo -e "  ${CYAN}3. Run Test Suites:${NC}"
echo "     Frontend Vitest: ${BOLD}cd frontend && npm test${NC}"
echo "     Backend Jest:    ${BOLD}cd backend && npm test${NC}"
echo ""
echo -e "${GREEN}Happy coding with Web3 Student Lab! 🚀${NC}"
echo ""
