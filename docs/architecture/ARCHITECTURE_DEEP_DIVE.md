# Architecture Deep Dive: Web3 Student Lab

This document provides a technical deep dive into the architecture of the Web3 Student Lab platform.
It details how the Frontend, Backend, and Stellar Network components work together to provide a
seamless educational experience for blockchain students.

## 🏗️ High-Level System Overview

The Web3 Student Lab follows a modular, 3-tier architecture designed for scalability, security, and
educational clarity.

```mermaid
graph TD
    User([Student / Developer])

    subgraph "Frontend (Next.js)"
        UI[User Interface]
        Sim[Blockchain Simulator]
        Play[Soroban Playground]
    end

    subgraph "Backend (Node.js/Express)"
        API[Express API]
        Auth[Auth Service]
        Logic[Learning Logic]
        StellarGW[Stellar SDK Gateway]
    end

    subgraph "Database (PostgreSQL)"
        DB[(Postgres/Prisma)]
    end

    subgraph "Blockchain (Stellar Network)"
        Contracts[Soroban Smart Contracts]
        Ledger[(Stellar Ledger)]
    end

    User <--> UI
    UI <--> API
    API <--> DB
    API <--> StellarGW
    StellarGW <--> Contracts
    Contracts <--> Ledger
```

## 🧩 Component Roles & Responsibilities

### 1. Frontend (The User Experience)

- **Next.js (React)**: Handles routing, state management, and the overall UI.
- **Monaco Editor**: Provides a rich in-browser coding experience for smart contracts.
- **Tailwind CSS**: Ensures a modern, responsive design across all devices.
- **Visual Simulator**: Locally computes and visualizes blockchain concepts (hashes, mining, blocks)
  for educational purposes.

### 2. Backend (The Orchestrator)

- **Node.js & Express**: Provides the RESTful API that the frontend consumes.
- **Prisma ORM**: Manages interaction with the PostgreSQL database, ensuring type-safety and
  efficient queries.
- **Stellar SDK**: Primarily acts as a gateway to the Stellar Network, handling transaction
  preparation, signing (with service keys), and submission.
- **Learning Logic**: Manages course progress, quiz validations, and student profiles.

### 3. Contracts (The Source of Truth)

- **Soroban (Rust)**: Contracts are written in Rust and compiled to WASM for high-performance and
  secure execution.
- **CertificateContract**: Manages the issuance and verification of student certificates directly on
  the Stellar Ledger.
- **TokenContract**: (Optional/Planned) Manages lab-specific rewards or tokens.

---

## 🔄 Core Data & Control Flows

### 🎓 Certificate Issuance Flow

This diagram illustrates the sequence from when a student finishes a course to the moment a
certificate is minted on the Stellar network and recorded in the local database.

```mermaid
sequenceDiagram
    autonumber
    participant Student as User (Browser)
    participant Front as Frontend (Next.js)
    participant Back as Backend (Node.js)
    participant DB as Database (PostgreSQL)
    participant Stellar as Stellar Network (Soroban)

    Student->>Front: Completes Course
    Front->>Back: POST /api/certificates { studentId, courseId }
    Back->>DB: Verify Course Completion
    DB-->>Back: Success

    Note right of Back: Backend prepares Soroban<br/>Contract Invocation

    Back->>Stellar: invoke 'issue' (student, course)
    Stellar-->>Back: Returns Transaction Hash

    Back->>DB: Create Certificate Record status='issued', hash=tx_hash
    DB-->>Back: Success

    Back-->>Front: 201 Created { certificateHash }
    Front-->>Student: Displays Certificate with Blockchain Link
```

## 🗄️ Unified Data Model

The local database maintains a mirror of essential on-chain data to ensure fast response times and
support complex queries (e.g., student leaderboards) that aren't efficient to perform directly
on-ledger.

```mermaid
erDiagram
    STUDENT ||--o{ ENROLLMENT : has
    STUDENT ||--o{ CERTIFICATE : receives
    COURSE ||--o{ ENROLLMENT : contains
    COURSE ||--o{ CERTIFICATE : awards

    STUDENT {
        string id
        string email
        string firstName
        string lastName
    }

    COURSE {
        string id
        string title
        int credits
    }

    CERTIFICATE {
        string id
        string studentId
        string courseId
        string certificateHash
        string status
    }

    ENROLLMENT {
        string id
        string studentId
        string courseId
        string status
    }
```

---

## 🔒 Security & Scaling Considerations

1.  **JWT Authentication**: All communication between the frontend and backend is secured using
    signed JSON Web Tokens.
2.  **Stellar Key Management**: Private keys for contract invocation are managed on the backend
    using environment variables or dedicated secret management services.
3.  **Idempotency**: Blockchain operations use unique identifiers to prevent accidental
    double-issuance of certificates.
4.  **Optimistic UI**: The frontend updates immediately upon backend success, while the blockchain
    finalization happens asynchronously.
