# Beginner’s Guide to Soroban (Stellar Smart Contracts)

## Introduction - What is Soroban?

Soroban is the smart contract platform built on the Stellar network, designed to enable developers
to create scalable, secure, and efficient decentralized applications.

Smart contracts in Soroban are small programs written in Rust and compiled into WebAssembly (WASM)
for deployment on the Stellar blockchain.

The name “Soroban” comes from the Japanese abacus — a lightweight tool known for efficiency and
accuracy — reflecting the platform’s focus on performance and precision.

This guide is intended for everyone exploring Soroban, including:

- Beginners learning smart contracts for the first time
- Web3 developers transitioning from Ethereum or other ecosystems
- Experienced engineers exploring Stellar

It provides a clear overview of how Soroban works, why it matters, and how to get started.

### Key Features ( Why Soroban ?):

| Feature             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| ⚡ High Performance | Fast execution with low latency                        |
| 💸 Low Costs        | Minimal transaction fees compared to other chains      |
| 🔒 Secure Execution | Deterministic and sandboxed runtime                    |
| 🦀 Rust-Based       | Memory-safe language with a strong ecosystem           |
| 🌐 Stellar Native   | Deep integration with Stellar's payment infrastructure |

### Prerequisites

Before diving in, you should have a basic understanding of:

- **Terminal / Command Line** — you'll run commands to build and deploy contracts
- **Programming fundamentals** — variables, functions, data types
- **Rust (basics)** — Soroban contracts are written in Rust; you don't need to be an expert, but
  familiarity helps

💡 New to Rust? Check out [The Rust Book](https://doc.rust-lang.org/book/) — chapters 1–6 cover
everything you need to get started.

## Architecture Overview - How Soroban works (Lifecycle)

Soroban operates as a smart contract layer that sits on top of the Stellar network. Here is the
end-to-end flow:

### Key Components :

```
    User / Frontend
        ↓  (sends a transaction)
    Soroban Contract  (Rust → compiled to WASM)
        ↓  (executed by the runtime)
    WASM Runtime  (sandboxed, deterministic execution)
        ↓  (writes results to)
    Stellar Ledger  (stores state + transaction history)
```

### Key Components:

| Component         | Role                                            |
| ----------------- | ----------------------------------------------- |
| Frontend / Client | Your app or CLI that triggers contract calls    |
| Soroban Contract  | Business logic written in Rust                  |
| WASM Runtime      | Executes compiled contracts in a secure sandbox |
| Stellar Ledger    | Stores contract state and transaction history   |

### Contract Lifecycle

Every Soroban contract goes through four stages:

- **Write** — Write your contract logic in Rust
- **Build** — Compile it to a **.wasm** binary
- **Deploy** — Upload the WASM file to the Stellar network
- **Invoke** — Call contract functions via transactions

## Core Concepts

Understanding these terms will help you follow the rest of this guide.

### Contract

A contract is a program deployed on the blockchain that defines rules and logic. Once deployed, it
runs exactly as written — no one can alter its behaviour.

### WebAssembly (WASM)

WASM is the compiled format Soroban uses to execute contracts. You write in Rust, but the network
runs WASM. This makes execution fast, portable, and sandboxed.

### Ledger

The ledger is Stellar's version of a blockchain block. It records every state change — balances,
contract data, and transaction history.

### Environment (Env)

The Env object is passed into every Soroban function. It gives your contract access to:

- On-chain storage (read/write persistent data)
- Cryptographic utilities
- Event logging
- Contract-to-contract calls

Think of Env as the contract's connection to the blockchain.

### Storage

Soroban has three types of storage with different lifetimes:

| Type           | Lifetime                              | Use Case                |
| -------------- | ------------------------------------- | ----------------------- |
| **Persistent** | Long-lived, survives ledger archiving | User balances, config   |
| **Temporary**  | Short-lived, cheaper                  | Caches, session data    |
| **Instance**   | Tied to contract instance             | Contract-level settings |

## Getting Started

**Step 1 — Install Rust**

If you don't have Rust installed, run:

`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

Then add the WASM compilation target (required for Soroban):

`rustup target add wasm32-unknown-unknown`

**Step 2 — Install the Soroban CLI**

The Soroban CLI is your main tool for building, deploying, and interacting with contracts from the
terminal.

`cargo install --locked soroban-cli`

Verify the installation:

`soroban --version`

**Step 3 — Configure the Testnet**

Set up a test identity (a local keypair used to sign transactions) and configure the Testnet:

```
soroban keys generate --global alice --network testnet
soroban network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

💡 The Testnet is a safe environment to experiment — transactions cost nothing and mistakes don't
matter.

### Deploy to Testnet

```
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/my_contract.wasm \
  --source alice \
  --network testnet
```

### Interact with the Contract

```
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  your_function_name
```

### Example Contract

```
#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(_env: Env) -> u32 {
        1
    }
}
```

## When to Use Soroban

Soroban is particularly well-suited for:

- **DeFi applications** — lending, swaps, liquidity pools
- **Payment system** — programmable money flows and escrow
- **Tokenized assets** — representing real-world assets on-chain
- **Identity systems** — verifiable credentials and access control
- **Financial infrastructure** — cross-border settlements, multi-sig treasuries

## Best Practices

Keep these principles in mind as you build:

- **Keep contracts small and modular** — split complex logic across multiple contracts
- **Validate all inputs** — never trust data coming from the outside world
- **Optimize for cost** — storage and computation cost fees; avoid storing unnecessary data
- **Write tests** — Soroban's SDK includes a testing framework; use it
- **Emit events** — use env.events().publish(...) so off-chain apps can react to state changes
- **Choose storage types wisely** — use Temporary for short-lived data to save fees

## Next Steps

- **Learn Rust fundamentals** — The Rust Book chapters 1–10
- **Explore authorization** — learn how to restrict who can call your functions
- **Study token contracts** — understand the Stellar Asset Contract (SAC) standard
- **Build a frontend** — connect your contract to a web app using @stellar/stellar-sdk
- **Write tests** — add unit tests using Soroban's built-in test environment Browse examples — study
  real contracts at soroban-examples

## Official Resources

| Resource                  | Link                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Stellar Developer Docs    | [developers.stellar.org](https://developers.stellar.org)                           |
| Soroban Documentation     | [soroban.stellar.org/docs](https://soroban.stellar.org/docs)                       |
| Soroban Examples (GitHub) | [github.com/stellar/soroban-examples](https://github.com/stellar/soroban-examples) |
| Rust Programming Language | [rust-lang.org/learn](https://www.rust-lang.org/learn)                             |
| Stellar Discord           | [discord.gg/stellardev](https://discord.gg/stellardev)                             |

## Conclusion

Soroban gives developers a powerful, low-cost, and secure platform to build smart contracts on
Stellar. By writing in Rust and deploying WASM, you get both performance and safety — all deeply
integrated with Stellar's existing payment infrastructure.

This guide covered the basics: how Soroban works, the key concepts, and how to deploy your first
contract. The best next step is to keep building — every real contract you write will teach you
something new.
