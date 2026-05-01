#!/bin/bash

# Stop Services Script
# This script stops all running services for the subscription management system

set -e

echo "=== Stopping Subscription Management System Services ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Stop backend service
stop_backend() {
    if [ -f .backend.pid ]; then
        BACKEND_PID=$(cat .backend.pid)
        if kill -0 $BACKEND_PID 2>/dev/null; then
            print_status "Stopping backend service (PID: $BACKEND_PID)..."
            kill $BACKEND_PID
            sleep 2
            # Force kill if still running
            if kill -0 $BACKEND_PID 2>/dev/null; then
                print_warning "Force killing backend service..."
                kill -9 $BACKEND_PID
            fi
        else
            print_warning "Backend service is not running"
        fi
        rm .backend.pid
    else
        print_warning "Backend PID file not found"
    fi
}

# Stop frontend service
stop_frontend() {
    if [ -f .frontend.pid ]; then
        FRONTEND_PID=$(cat .frontend.pid)
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            print_status "Stopping frontend service (PID: $FRONTEND_PID)..."
            kill $FRONTEND_PID
            sleep 2
            # Force kill if still running
            if kill -0 $FRONTEND_PID 2>/dev/null; then
                print_warning "Force killing frontend service..."
                kill -9 $FRONTEND_PID
            fi
        else
            print_warning "Frontend service is not running"
        fi
        rm .frontend.pid
    else
        print_warning "Frontend PID file not found"
    fi
}

# Kill any remaining processes on ports
kill_remaining_processes() {
    print_status "Checking for remaining processes on ports 3000 and 8080..."
    
    # Kill processes on port 3000 (frontend)
    FRONTEND_PROCESSES=$(lsof -ti:3000 2>/dev/null || true)
    if [ ! -z "$FRONTEND_PROCESSES" ]; then
        print_warning "Killing remaining frontend processes on port 3000..."
        echo $FRONTEND_PROCESSES | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill processes on port 8080 (backend)
    BACKEND_PROCESSES=$(lsof -ti:8080 2>/dev/null || true)
    if [ ! -z "$BACKEND_PROCESSES" ]; then
        print_warning "Killing remaining backend processes on port 8080..."
        echo $BACKEND_PROCESSES | xargs kill -9 2>/dev/null || true
    fi
}

# Main cleanup function
main() {
    print_status "Stopping all services..."
    
    stop_backend
    stop_frontend
    kill_remaining_processes
    
    print_status "All services stopped successfully"
}

# Run main function
main
