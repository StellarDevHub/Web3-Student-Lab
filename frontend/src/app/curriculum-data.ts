export type Lesson = {
  id: string;
  title: string;
  route: string;
  duration: string;
  content?: string[];
  starterCode?: string;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  accent: string;
  lessons: Lesson[];
};

export const courses: Course[] = [
  {
    id: "blockchain-foundations",
    title: "Blockchain Foundations",
    description: "Understand blocks, hashes, wallets, and decentralized networks.",
    accent: "#6366f1",
    lessons: [
      {
        id: "blocks",
        title: "Cryptographic Hashes & Blocks",
        route: "/roadmap/blockchain-foundations/blocks",
        duration: "15 min",
        content: [
          "A blockchain is a decentralized, immutable ledger where data is cryptographically secured across a network of participants.",
          "At the core of this structure is the cryptographic hash function (like SHA-256). It takes an input of any size and produces a fixed-size, deterministic output. Even a single bit change in the input completely changes the output.",
          "In the editor, we will write a professional Rust implementation of a block hashing mechanism, leveraging a mock SHA-256 function to understand memory layout and immutability."
        ],
        starterCode: `use std::time::{SystemTime, UNIX_EPOCH};\n\n#[derive(Clone, Debug)]\npub struct Block {\n    pub index: u64,\n    pub timestamp: u128,\n    pub data: String,\n    pub previous_hash: String,\n    pub hash: String,\n}\n\nimpl Block {\n    pub fn new(index: u64, data: String, previous_hash: String) -> Self {\n        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();\n        let mut block = Self {\n            index,\n            timestamp,\n            data,\n            previous_hash,\n            hash: String::new(),\n        };\n        block.hash = block.calculate_hash();\n        block\n    }\n\n    pub fn calculate_hash(&self) -> String {\n        // TODO: Implement a pseudo-hashing function combining index, timestamp, data, and previous_hash\n        // Hint: Format them into a single string and return a simulated hex string.\n        String::from("hash_placeholder")\n    }\n}`
      },
      {
        id: "wallets",
        title: "Wallets, Keys, and Signatures",
        route: "/roadmap/blockchain-foundations/wallets",
        duration: "20 min",
        content: [
          "In Web3, identity and asset ownership are managed via asymmetric cryptography. A 'wallet' does not hold tokens; it holds the cryptographic keys required to sign transactions.",
          "The Stellar network utilizes Ed25519 cryptography. Your public key acts as your network address (starting with 'G'), and your private key (starting with 'S') is used to sign transactions.",
          "Let's implement a simplified Ed25519 keypair generator structure that derives a public address from a private seed."
        ],
        starterCode: `pub struct Keypair {\n    secret_seed: [u8; 32],\n    public_key: [u8; 32],\n}\n\nimpl Keypair {\n    pub fn from_secret_seed(seed: [u8; 32]) -> Self {\n        // In a real environment, we use curve25519 math to derive the public key.\n        // For this exercise, simulate the derivation by reversing the seed bytes.\n        let mut public_key = [0u8; 32];\n        // TODO: Implement the simulated derivation logic here\n\n        Self { secret_seed: seed, public_key }\n    }\n\n    pub fn get_stellar_address(&self) -> String {\n        // TODO: Return a simulated Stellar address starting with 'G'\n        String::from("G...")\n    }\n}`
      },
      {
        id: "consensus",
        title: "The Stellar Consensus Protocol",
        route: "/roadmap/blockchain-foundations/consensus",
        duration: "25 min",
        content: [
          "Unlike Proof of Work (PoW) or Proof of Stake (PoS), the Stellar Consensus Protocol (SCP) uses Federated Byzantine Agreement (FBA).",
          "In FBA, each node chooses a 'quorum slice'—a specific set of trusted peers. System-wide consensus is achieved when quorum slices overlap, preventing conflicting transactions from being validated.",
          "In this advanced exercise, write a function that validates if two nodes' quorum slices overlap securely."
        ],
        starterCode: `use std::collections::HashSet;\n\npub struct Node {\n    pub id: String,\n    pub quorum_slice: HashSet<String>,\n}\n\nimpl Node {\n    /// Validates if this node's quorum slice has a safe overlap with another node's slice.\n    /// FBA requires intersecting quorum slices to prevent network forks.\n    pub fn has_quorum_intersection(&self, other: &Node) -> bool {\n        // TODO: Return true if the intersection of self.quorum_slice and other.quorum_slice is not empty.\n        false\n    }\n}`
      },
    ],
  },
  {
    id: "smart-contracts",
    title: "Smart Contracts",
    description: "Learn how programmable agreements power Web3 products.",
    accent: "#14b8a6",
    lessons: [
      {
        id: "intro-contracts",
        title: "Contract Architecture & Environment",
        route: "/roadmap/smart-contracts/intro",
        duration: "20 min",
        content: [
          "Smart contracts are autonomous programs deployed on-chain. On Stellar, smart contracts are powered by the Soroban environment, utilizing WebAssembly (WASM) for efficient and predictable execution.",
          "The \`Env\` object in Soroban provides access to the ledger's state, cryptographic functions, and contract invocations.",
          "Write a professional contract that performs basic compute operations while strictly managing execution footprints."
        ],
        starterCode: `#![no_std]\nuse soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};\n\n#[contract]\npub struct CalculatorContract;\n\n#[contractimpl]\nimpl CalculatorContract {\n    /// Adds two 64-bit integers securely, checking for overflow.\n    pub fn add(env: Env, a: i64, b: i64) -> i64 {\n        // TODO: Implement checked addition. Panic if overflow occurs.\n        // Hint: use a.checked_add(b).unwrap()\n        0\n    }\n}`
      },
      {
        id: "soroban-state",
        title: "Persistent State & Authorization",
        route: "/roadmap/smart-contracts/soroban-state",
        duration: "30 min",
        content: [
          "Soroban supports three types of state storage: Temporary, Instance, and Persistent. Managing these correctly is critical for cost efficiency and security.",
          "Equally important is \`require_auth()\`, which ensures that the invoker has cryptographically signed the transaction approving the specific function call and parameters.",
          "Implement a secure vault contract that stores a persistent balance and requires authorization to withdraw funds."
        ],
        starterCode: `#![no_std]\nuse soroban_sdk::{contract, contractimpl, Env, Address, Symbol};\n\n#[contract]\npub struct VaultContract;\n\n#[contractimpl]\nimpl VaultContract {\n    /// Withdraws an amount to the caller's address, ensuring they authorize the transaction.\n    pub fn withdraw(env: Env, caller: Address, amount: i128) {\n        // 1. Require authorization from the caller\n        caller.require_auth();\n\n        // 2. Fetch current balance from persistent storage\n        // TODO: Implement balance check and deduction logic\n    }\n}`
      },
      {
        id: "testing",
        title: "Comprehensive Testing Strategies",
        route: "/roadmap/smart-contracts/testing",
        duration: "25 min",
        content: [
          "In Web3, testing is not optional; deploying untested code can lead to catastrophic financial loss. Soroban allows rigorous testing using Rust's native \`cargo test\`.",
          "Professional testing involves simulating the \`Env\`, mocking user authorization, and performing contract-to-contract invocations.",
          "Write a comprehensive test suite for the Vault contract, validating both successful transactions and intentional failures."
        ],
        starterCode: `#[cfg(test)]\nmod test {\n    use super::*;\n    use soroban_sdk::{Env, testutils::Address as _};\n\n    #[test]\n    fn test_vault_withdrawal() {\n        let env = Env::default();\n        let contract_id = env.register_contract(None, VaultContract);\n        let client = VaultContractClient::new(&env, &contract_id);\n\n        // Mock an address\n        let user = Address::generate(&env);\n\n        // TODO: Mock the user's auth and invoke client.withdraw(&user, &1000)\n        // TODO: Assert the resulting balance\n    }\n}`
      },
    ],
  },
  {
    id: "open-source",
    title: "Open Source Lab",
    description: "Practice GitHub issues, branches, reviews, and pull requests.",
    accent: "#f59e0b",
    lessons: [
      {
        id: "issues",
        title: "Triaging & Reproducing Issues",
        route: "/roadmap/open-source/issues",
        duration: "15 min",
        content: [
          "Professional open-source contribution begins with effective communication. GitHub issues are used to track bugs, propose architectural changes, and manage project milestones.",
          "A high-quality bug report provides minimal reproducible examples (MREs), environment details, and execution context.",
          "Format a comprehensive bug report template using Markdown."
        ],
        starterCode: `## 🐛 Bug Report\n\n### Description\n<!-- Provide a clear, concise description of the issue. -->\n\n### Environment\n- **OS**: \n- **Node.js/Rust version**: \n- **Browser**: \n\n### Steps to Reproduce\n<!-- Provide a minimal, reproducible example -->\n1. \n2. \n3. \n\n### Expected vs Actual Behavior\n<!-- What did you expect? What actually happened? Provide stack traces if applicable. -->\n`
      },
      {
        id: "branches",
        title: "Advanced Git Workflows",
        route: "/roadmap/open-source/branches",
        duration: "20 min",
        content: [
          "Maintaining a clean commit history is essential for collaborative projects. Teams rely on feature branches, rebasing, and atomic commits.",
          "Instead of a simple merge, a \`git rebase\` rewrites your branch's history to sit neatly on top of the main branch, avoiding cluttered merge commits.",
          "In the editor, simulate the CLI commands required to fetch the latest upstream changes, rebase your feature branch, and force push safely."
        ],
        starterCode: `# 1. Fetch the latest changes from the upstream remote\ngit fetch upstream\n\n# 2. Switch to your feature branch (e.g., feature/auth-fix)\ngit checkout feature/auth-fix\n\n# 3. Rebase your branch on top of upstream/main\n# TODO: Write the rebase command here\n\n# 4. Safely push the rewritten history to your fork\n# TODO: Write the push command (Hint: use --force-with-lease)`
      },
      {
        id: "prs",
        title: "The Art of the Pull Request",
        route: "/roadmap/open-source/pull-requests",
        duration: "25 min",
        content: [
          "A Pull Request (PR) is a formal request to merge your changes into the primary repository. It initiates a peer-review process where code quality, security, and logic are scrutinized.",
          "A professional PR references the related issue, explains the architectural decisions, and highlights areas where the author wants specific feedback.",
          "Draft a professional PR description utilizing semantic structure and GitHub's auto-linking features."
        ],
        starterCode: `## 🚀 PR: Refactor Vault Authorization\n\n### Resolves Issue\n<!-- Link the issue using GitHub keywords (e.g., Fixes #123) -->\nFixes #\n\n### Architectural Changes\n- Migrated from generic \`Address\` checks to strict \`require_auth()\` enforcement.\n- Separated instance storage limits from temporary computation bounds.\n\n### Testing & Verification\n- [ ] Unit tests pass via \`cargo test\`\n- [ ] Checked for arithmetic overflows\n\n### Review Focus\n<!-- Direct the reviewers to specific lines or concepts -->\nPlease pay special attention to the state rollback logic in \`src/vault.rs:45\`.`
      },
    ],
  },
];

export const allLessons = courses.flatMap((course) =>
  course.lessons.map((lesson) => ({ ...lesson, courseId: course.id, courseTitle: course.title }))
);

export const storageKeys = {
  completed: "web3-student-lab.completed-lessons",
  bookmarks: "web3-student-lab.bookmarked-lessons",
  celebrated: "web3-student-lab.course-completion-celebrated",
};
