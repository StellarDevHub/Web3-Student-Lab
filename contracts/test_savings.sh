#!/bin/bash

echo "🧪 Testing Savings Wallet Implementation..."
echo ""

# Test interest calculation logic
echo "Testing interest calculation..."
cargo test --lib compound_interest -- --nocapture

echo ""
echo "✅ Savings Wallet Tests Complete!"
