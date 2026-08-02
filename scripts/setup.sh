#!/bin/bash

# Web3 Student Lab - Quick Start Script
# This script helps you set up and run the full stack application

set -e  # Exit on error

echo "🚀 Web3 Student Lab - Quick Start"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo -e "${BLUE}Step 1: Setting up Backend${NC}"
echo "-----------------------------------"
cd backend

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating backend .env file...${NC}"
    cp .env.example .env 2>/dev/null || echo "PORT=8080
DATABASE_URL=\"postgresql://localhost:5432/web3lab?user=postgres&password=postgres\"
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development" > .env
    echo "✅ Created .env file - Please update DATABASE_URL and JWT_SECRET"
else
    echo "✅ Backend .env exists"
fi

# Install backend dependencies
echo -e "${GREEN}Installing backend dependencies...${NC}"
npm install

# Setup database
echo -e "${YELLOW}Setting up database...${NC}"
if command -v npx &> /dev/null; then
    npx prisma generate
    echo "✅ Prisma client generated"
    
    # Ask user if they want to run migrations
    read -p "Do you want to run database migrations? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npx prisma migrate dev --name init
        echo "✅ Database migrations completed"
    fi
else
    echo "⚠️  npx not found, skipping Prisma setup"
fi

cd ..

echo ""
echo -e "${BLUE}Step 2: Setting up Frontend${NC}"
echo "------------------------------------"
cd frontend

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}Creating frontend .env.local file...${NC}"
    cp .env.local.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-test.stellar.org:443
NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID=" > .env.local
    echo "✅ Created .env.local file"
else
    echo "✅ Frontend .env.local exists"
fi

# Install frontend dependencies
echo -e "${GREEN}Installing frontend dependencies...${NC}"
npm install

cd ..

echo ""
echo -e "${BLUE}Step 3: Build Check${NC}"
echo "-------------------"

# Build frontend
echo -e "${YELLOW}Building frontend...${NC}"
cd frontend
npm run build
echo "✅ Frontend build successful"
cd ..

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "=================================="
echo "📋 Next Steps:"
echo "=================================="
echo ""
echo "1. Update environment files:"
echo "   - backend/.env: Set DATABASE_URL and JWT_SECRET"
echo "   - frontend/.env.local: Verify API URL"
echo ""
echo "2. Start the backend server:"
echo "   cd backend"
echo "   npm run dev"
echo ""
echo "3. In a new terminal, start the frontend:"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "4. Open your browser:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend API: http://localhost:8080"
echo "   - API Health: http://localhost:8080/health"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "- Make sure PostgreSQL is running before starting the backend"
echo "- Create a test account via /auth/register"
echo "- Browse courses at /courses"
echo "- Verify certificates at /verify"
echo ""
echo "🎉 Happy learning with Web3 Student Lab!"
echo ""
