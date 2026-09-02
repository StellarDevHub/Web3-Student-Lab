# Testnet Faucet Integration Smart Contract

A Soroban smart contract that provides testnet token distribution for hackathon project ideas in the Web3 Student Lab platform.

## Features

- **Token Requests**: Users can request testnet tokens for their projects
- **Project Management**: Create and track hackathon project ideas
- **Rate Limiting**: Daily limits to prevent abuse
- **Configurable Limits**: Admin can adjust request and daily limits
- **Balance Management**: Track faucet funding and distribution

## API

### Initialization
- `initialize(admin, token_address)` - Setup faucet with admin and token

### Token Distribution
- `request_tokens(user, amount, project_id)` - Request tokens for a project
- `can_request(user)` - Check if user can make a request
- `get_balance()` - Get current faucet balance

### Project Management
- `create_project(creator, title, description, required_tokens)` - Create project idea
- `get_project(project_id)` - Get project details
- `list_projects()` - List all projects

### Admin Functions
- `fund_faucet(funder, amount)` - Add tokens to faucet
- `set_request_limit(new_limit)` - Update per-request limit
- `set_daily_limit(new_limit)` - Update daily limit

## Default Limits

- Request Limit: 1,000 tokens per request
- Daily Limit: 10,000 tokens per day
- Cooldown: 24 hours between requests

## Testing

All tests pass with comprehensive coverage of token requests, project management, and rate limiting.
