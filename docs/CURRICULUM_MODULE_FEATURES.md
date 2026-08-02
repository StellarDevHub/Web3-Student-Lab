# Curriculum Module Features

Four MVP-critical features added across the Web3 Student Lab curriculum modules.

## Routes

| Feature | Module | Route | Backend API |
|---------|--------|-------|-------------|
| Gas Estimation Calculator | Open Source Contribution Trainer | `/open-source/gas-calculator` | `POST /api/v1/osct/gas-estimate` |
| Block Explorer Interface | Hackathon Project Idea Generator | `/hackathon-ideas/explorer` | `GET /api/v1/generator/explorer/snapshot` |
| Security Vulnerability Scanner | Blockchain Learning Simulator | `/simulator/scanner` | `POST /api/v1/simulator/scan` |
| Issue Triage Minigame | Smart Contract Playground | `/playground/triage` | `POST /api/v1/playground/triage/score` |

## Architecture

Each feature follows the **lib → hook → component → route** pattern (frontend) and **service → route → test** pattern (backend).

## Tests

```bash
# Frontend unit tests
cd frontend
npx vitest run src/lib/open-source/__tests__/gasCalculator.test.ts
npx vitest run src/lib/idea-generator/__tests__/blockExplorer.test.ts
npx vitest run src/lib/simulator/__tests__/vulnerabilityScanner.test.ts
npx vitest run src/lib/playground/__tests__/issueTriage.test.ts

# Backend unit tests
cd backend
npm test -- --testPathPattern="gas-estimation|block-explorer|vulnerability-scanner|issue-triage"
```

## Tech Stack Alignment

- **Gas Calculator**: Soroban resource estimation, OSCT budget presets, CI-compatible service layer
- **Block Explorer**: Stellar transaction feed, Redis-cached snapshots, hackathon idea suggestions
- **Vulnerability Scanner**: Static Soroban rule engine, severity scoring for educational feedback
- **Issue Triage**: XState minigame, Redis leaderboard via CacheService microservice pattern
