import json
import random
import os
import subprocess

modules = [
    "Blockchain Learning Simulator",
    "Smart Contract Playground",
    "Web3 Learning Roadmap",
    "Hackathon Project Idea Generator",
    "Open Source Contribution Trainer",
    "Platform Infrastructure",
    "User Dashboard"
]

issue_types = [
    {"type": "Frontend", "difficulty": "Beginner", "tech": "React, Tailwind CSS", "label": "frontend"},
    {"type": "Frontend", "difficulty": "Intermediate", "tech": "Next.js, State Management, UI/UX", "label": "frontend"},
    {"type": "Backend", "difficulty": "Intermediate", "tech": "Node.js, Express, PostgreSQL", "label": "backend"},
    {"type": "Backend", "difficulty": "Hard", "tech": "Node.js, Microservices, Redis", "label": "backend"},
    {"type": "Smart Contract", "difficulty": "Intermediate", "tech": "Rust, Soroban", "label": "smart-contract"},
    {"type": "Smart Contract", "difficulty": "Hard", "tech": "Rust, Soroban, DeFi", "label": "smart-contract"},
    {"type": "DevOps", "difficulty": "Intermediate", "tech": "Docker, CI/CD, GitHub Actions", "label": "devops"}
]

action_verbs = ["Implement", "Build", "Create", "Design", "Refactor", "Optimize", "Integrate", "Develop"]
features = [
    "User Onboarding Flow", "Interactive Tutorial", "Dark Mode Toggle", "Progress Tracking Dashboard",
    "Code Compilation Web Worker", "Real-time Chat", "Project Submission Portal", "Peer Review System",
    "Gamification Badges", "Leaderboard", "Wallet Connection Modal", "Transaction History Table",
    "Smart Contract Template Library", "Auto-save Feature for Editor", "Error Highlighting in Playground",
    "Mobile Responsive Layout", "API Rate Limiting", "OAuth Integration", "Email Notification System",
    "Database Indexing", "Caching Layer", "WebSocket Subscriptions", "Analytics Dashboard",
    "Content Management System", "Automated Testing Suite", "CI/CD Pipeline", "Documentation Site",
    "Testnet Faucet Integration", "RPC Endpoint Switcher", "Contract Verification Tool",
    "Multi-sig Wallet Support", "Token Vesting UI", "Decentralized Identity Verification",
    "Hackathon Team Matching", "Idea Voting Mechanism", "Mentor Booking System",
    "Interactive Cryptography Visualizer", "Hash Function Demo", "Merkle Tree Builder",
    "P2P Network Simulator", "Consensus Algorithm Sandbox", "Block Explorer Interface",
    "Custom RPC URL Support", "Gas Estimation Calculator", "Transaction Visualizer",
    "Local Node Setup Script", "GitHub OAuth Login", "PR Simulation Environment",
    "Issue Triage Minigame", "Git Conflict Resolution Tutorial", "Open Source License Guide",
    "Accessibility Auditing", "i18n Internationalization", "SEO Optimization",
    "Performance Profiling", "Security Vulnerability Scanner", "Dependency Update Automation",
    "Role-based Access Control", "Data Export Feature", "Notification Preferences",
    "Social Media Sharing", "Referral Program System", "Search and Filter Enhancements",
    "Activity Log Implementation", "Payment Gateway Integration", "GraphQL API Support",
    "Webhooks System", "Error Logging Dashboard", "Terms of Service Modal", "Privacy Policy Enforcer"
]

# Ensure we have enough unique features
# If not enough, we just cycle them

issues = []
for i in range(70):
    issue_type = random.choice(issue_types)
    module = random.choice(modules)
    action = random.choice(action_verbs)
    feature = features[i % len(features)]
    
    title = f"[{issue_type['type']}] {action} {feature} for {module}"
    
    difficulty_label = f"complexity:{issue_type['difficulty'].lower()}"
    labels = [issue_type['label'], difficulty_label, "enhancement", "good first issue" if issue_type['difficulty'] == "Beginner" else "help wanted"]

    eta = "1-2 days" if issue_type['difficulty'] == "Beginner" else "2-3 days" if issue_type['difficulty'] == "Intermediate" else "3-5 days"
    
    body = f"""🚀 Feature Overview

{action} the {feature} within the {module} module to enhance user experience and platform capabilities.

This is an essential, MVP-critical feature designed to take Web3 Student Lab's curriculum layer to a dynamic, production-ready level.

🛠️ Implementation Requirements

- Implement core logic for {feature}.
- Ensure compatibility with existing {module} infrastructure.
- Add comprehensive tests for new functionality.

🔧 Technical Specifications

- Tech Stack: {issue_type['tech']}
- Tools: relevant SDKs

✅ Acceptance Criteria

- [ ] Feature is fully functional and passes all automated tests.
- [ ] Code meets project style guidelines.
- [ ] Documentation is updated.

🎓 Difficulty Level

{issue_type['difficulty']} - Requires understanding of {issue_type['type']} development.

⏱️ Timeline

ETA: {eta}
"""
    issues.append({"title": title, "body": body, "labels": labels})

output_path = os.path.join(os.path.dirname(__file__), "github_issues_payload.json")
with open(output_path, "w") as f:
    json.dump(issues, f, indent=2)

print(f"Generated payload for 70 issues at {output_path}.")
