#!/bin/bash

# Subscription Management System Deployment Script
# This script deploys the complete subscription management system

set -e

echo "=== Subscription Management System Deployment ==="
echo "Starting deployment process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    # Check Rust
    if ! command -v rustc &> /dev/null; then
        print_error "Rust is not installed. Please install Rust 1.70+"
        exit 1
    fi
    
    # Check Soroban CLI
    if ! command -v soroban &> /dev/null; then
        print_error "Soroban CLI is not installed. Please install soroban-cli"
        exit 1
    fi
    
    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL is not installed. Please ensure PostgreSQL is running"
    fi
    
    # Check Redis
    if ! command -v redis-cli &> /dev/null; then
        print_warning "Redis is not installed. Please ensure Redis is running"
    fi
    
    print_status "Prerequisites check completed"
}

# Deploy Smart Contract
deploy_contract() {
    print_status "Deploying smart contract..."
    
    cd contracts
    
    # Build contract
    print_status "Building contract..."
    cargo build --target wasm32-unknown-unknown --release
    
    # Get network from environment or default to testnet
    NETWORK=${SOROBAN_NETWORK:-"testnet"}
    SOURCE_KEY=${SOROBAN_SOURCE_KEY:-""}
    
    if [ -z "$SOURCE_KEY" ]; then
        print_error "SOROBAN_SOURCE_KEY environment variable is required"
        exit 1
    fi
    
    # Deploy contract
    print_status "Deploying contract to $NETWORK..."
    CONTRACT_ID=$(soroban contract deploy \
        --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
        --source $SOURCE_KEY \
        --network $NETWORK \
        --quiet)
    
    echo "CONTRACT_ID=$CONTRACT_ID" > ../.env.contract
    
    # Initialize contract
    print_status "Initializing contract..."
    ADMIN_ADDRESS=${SOROBAN_ADMIN_ADDRESS:-""}
    TREASURY_ADDRESS=${SOROBAN_TREASURY_ADDRESS:-""}
    
    if [ -z "$ADMIN_ADDRESS" ] || [ -z "$TREASURY_ADDRESS" ]; then
        print_error "SOROBAN_ADMIN_ADDRESS and SOROBAN_TREASURY_ADDRESS are required"
        exit 1
    fi
    
    soroban contract invoke \
        --id $CONTRACT_ID \
        --source $SOURCE_KEY \
        --network $NETWORK \
        -- \
        initialize \
        --admin $ADMIN_ADDRESS \
        --treasury $TREASURY_ADDRESS
    
    cd ..
    print_status "Smart contract deployed successfully: $CONTRACT_ID"
}

# Setup Backend
setup_backend() {
    print_status "Setting up backend..."
    
    cd backend
    
    # Install dependencies
    print_status "Installing backend dependencies..."
    npm install
    
    # Setup environment
    if [ ! -f .env ]; then
        print_status "Creating backend environment file..."
        cp .env.example .env
        
        # Update with contract ID
        sed -i.bak "s/CONTRACT_ID=/CONTRACT_ID=$(cat ../.env.contract | cut -d'=' -f2)/" .env
        rm .env.bak
    fi
    
    # Database setup
    print_status "Setting up database..."
    npx prisma migrate dev --name init
    npx prisma generate
    npx prisma db seed
    
    cd ..
    print_status "Backend setup completed"
}

# Setup Frontend
setup_frontend() {
    print_status "Setting up frontend..."
    
    cd frontend
    
    # Install dependencies
    print_status "Installing frontend dependencies..."
    npm install
    
    # Setup environment
    if [ ! -f .env.local ]; then
        print_status "Creating frontend environment file..."
        cp .env.example .env.local
        
        # Update with backend URL
        sed -i.bak "s|NEXT_PUBLIC_API_URL=|NEXT_PUBLIC_API_URL=http://localhost:8080|" .env.local
        sed -i.bak "s|NEXT_PUBLIC_WS_URL=|NEXT_PUBLIC_WS_URL=ws://localhost:8080|" .env.local
        rm .env.bak
    fi
    
    cd ..
    print_status "Frontend setup completed"
}

# Run Tests
run_tests() {
    print_status "Running tests..."
    
    # Smart contract tests
    print_status "Running smart contract tests..."
    cd contracts
    cargo test -- --nocapture
    cd ..
    
    # Backend tests
    print_status "Running backend tests..."
    cd backend
    npm run test
    npm run test:coverage
    cd ..
    
    # Frontend tests
    print_status "Running frontend tests..."
    cd frontend
    npm run test
    cd ..
    
    print_status "All tests completed successfully"
}

# Start Services
start_services() {
    print_status "Starting services..."
    
    # Start backend
    cd backend
    print_status "Starting backend server..."
    npm run dev &
    BACKEND_PID=$!
    cd ..
    
    # Wait for backend to start
    sleep 5
    
    # Start frontend
    cd frontend
    print_status "Starting frontend server..."
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    
    # Save PIDs for cleanup
    echo $BACKEND_PID > .backend.pid
    echo $FRONTEND_PID > .frontend.pid
    
    print_status "Services started successfully"
    print_status "Backend: http://localhost:8080"
    print_status "Frontend: http://localhost:3000"
}

# Health Check
health_check() {
    print_status "Performing health checks..."
    
    # Check backend health
    if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
        print_status "Backend health check passed"
    else
        print_error "Backend health check failed"
        return 1
    fi
    
    # Check frontend health
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        print_status "Frontend health check passed"
    else
        print_error "Frontend health check failed"
        return 1
    fi
    
    print_status "All health checks passed"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    
    if [ -f .backend.pid ]; then
        BACKEND_PID=$(cat .backend.pid)
        kill $BACKEND_PID 2>/dev/null || true
        rm .backend.pid
    fi
    
    if [ -f .frontend.pid ]; then
        FRONTEND_PID=$(cat .frontend.pid)
        kill $FRONTEND_PID 2>/dev/null || true
        rm .frontend.pid
    fi
    
    print_status "Cleanup completed"
}

# Trap cleanup on script exit
trap cleanup EXIT

# Main deployment flow
main() {
    print_status "Starting Subscription Management System deployment..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "contracts" ]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi
    
    check_prerequisites
    deploy_contract
    setup_backend
    setup_frontend
    
    if [ "$SKIP_TESTS" != "true" ]; then
        run_tests
    fi
    
    start_services
    
    # Wait a moment for services to fully start
    sleep 10
    
    health_check
    
    print_status "=== Deployment completed successfully! ==="
    print_status "Subscription Management System is now running:"
    print_status "  Frontend: http://localhost:3000"
    print_status "  Backend API: http://localhost:8080"
    print_status "  Contract ID: $(cat .env.contract | cut -d'=' -f2)"
    print_status ""
    print_status "To stop the services, run: ./scripts/stop-services.sh"
    print_status "To view logs, check the respective terminal windows"
    
    # Keep script running to maintain services
    if [ "$DETACH" != "true" ]; then
        print_status "Press Ctrl+C to stop all services"
        while true; do
            sleep 1
        done
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --detach)
            DETACH=true
            shift
            ;;
        --network)
            SOROBAN_NETWORK="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --skip-tests    Skip running tests"
            echo "  --detach        Run services in background"
            echo "  --network       Soroban network (testnet|mainnet)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main
