#!/usr/bin/env python3
"""
Automated script to parse all #[contracterror] enums across contracts/
and generate a standardized Markdown error reference table.
"""

import os
import re
from pathlib import Path

def find_contract_errors(root_dir):
    pattern = re.compile(
        r'#\[contracterror\]\s*(?:#\[[^\]]+\]\s*)*pub enum\s+(\w+)\s*\{([^}]+)\}',
        re.MULTILINE | re.DOTALL
    )
    variant_pattern = re.compile(
        r'((?:\s*///[^\n]*\n)*)\s*(\w+)\s*=\s*(\d+)',
        re.MULTILINE
    )

    results = []

    for path in sorted(Path(root_dir).rglob("*.rs")):
        if "target" in path.parts:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue

        for match in pattern.finditer(content):
            enum_name = match.group(1)
            body = match.group(2)
            rel_path = path.relative_to(root_dir)

            variants = []
            for v_match in variant_pattern.finditer(body):
                doc_lines = v_match.group(1).strip().splitlines()
                docs = " ".join([line.strip().lstrip("/").strip() for line in doc_lines if line.strip()]).strip()
                v_name = v_match.group(2)
                code = int(v_match.group(3))
                variants.append((code, v_name, docs or "No description provided"))

            if variants:
                results.append((rel_path, enum_name, sorted(variants, key=lambda x: x[0])))

    return results

def generate_markdown(errors, output_path):
    md = []
    md.append("# Standardized Smart Contract Error Code Registry\n")
    md.append("This document is automatically generated from `#[contracterror]` annotations across the workspace.\n")
    md.append("## Namespace Allocations\n")
    md.append("| Range | Category | Purpose |")
    md.append("| :--- | :--- | :--- |")
    md.append("| `100–199` | Authentication & Access Control | Signatures, permissions, session expiration, soulbound checks |")
    md.append("| `200–299` | Storage & State Lifecycle | Initialization, entity lookups, versioning, capacity |")
    md.append("| `300–399` | Arithmetic & Numerical Bounds | Overflow/underflow, zero checks, balance assertions, slippage |")
    md.append("| `400–499` | Governance, DAO & Proposals | Quorum, voting, proposal lifecycles, voice credits |")
    md.append("| `500+`    | Protocol-Specific & Oracles | AMM, TWAP, staking vaults, custom features |\n")

    md.append("## Contract Error Tables\n")

    for file_path, enum_name, variants in errors:
        md.append(f"### `{enum_name}` (`{file_path}`)\n")
        md.append("| Code | Variant Name | Description |")
        md.append("| :---: | :--- | :--- |")
        for code, name, doc in variants:
            md.append(f"| `{code}` | `{name}` | {doc} |")
        md.append("")

    content = "\n".join(md)
    Path(output_path).write_text(content, encoding="utf-8")
    print(f"Generated error reference at {output_path}")

if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    errors = find_contract_errors(base_dir)
    out_file = base_dir / "ERROR_REGISTRY.md"
    generate_markdown(errors, out_file)
