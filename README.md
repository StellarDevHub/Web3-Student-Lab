# Web3 Student Lab 🎓⛓️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)

**Web3 Student Lab** is an open-source educational platform that helps students learn blockchain,
smart contracts, open-source collaboration, and hackathon project development in one place.

The platform provides **interactive tools, coding environments, and guided learning paths** designed
for beginners and university students.

## 🚀 Core Modules

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

## 🤝 Contributing

We love our contributors! This project is being built for students, by students and open-source
enthusiasts.

To start contributing:

1. Read our [Contribution Guidelines](CONTRIBUTING.md).
2. Check out our existing [Issues](https://github.com/your-repo/issues) or look for the
   `good first issue` label.
3. Fork the repository and submit a Pull Request!

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
