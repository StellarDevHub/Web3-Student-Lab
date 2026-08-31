#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Gas & CPU benchmark suite entrypoint.
#
# Runs the `gas-benchmarks` crate, parses the emitted `__GAS_BENCH__` metric
# lines, compares them against the committed baseline snapshot and emits:
#   - a Markdown report (stdout) for the GitHub PR comment,
#   - a JSON report for machine consumption.
#
# Exits non-zero if any endpoint regresses by more than the configured
# threshold (default 10%).
#
# Usage:
#   ./scripts/run-gas-benchmarks.sh [threshold_pct]
#
# Env:
#   GAS_BENCH_REPORT   Path to write the JSON report (default gas_bench_report.json)
# -----------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$REPO_ROOT/contracts"
THRESHOLD="${1:-10}"
BASELINE="$CONTRACTS/gas_benchmarks/baselines/soroban_contracts.json"
REPORT="${GAS_BENCH_REPORT:-$REPO_ROOT/gas_bench_report.json}"

echo "==> Running gas benchmark suite (threshold: ${THRESHOLD}%)"
RAW="$(cd "$CONTRACTS" && cargo test --package gas-benchmarks -- --nocapture --test-threads=1 2>&1)"

# Parse machine-readable metrics (robust to the test-harness prefix).
echo "$RAW" | grep -o '__GAS_BENCH__ .*' | sed 's/^__GAS_BENCH__ //' > /tmp/gas_bench_raw.jsonl || true

echo "==> Building comparison report"
python3 - "$THRESHOLD" "$BASELINE" "$REPORT" /tmp/gas_bench_raw.jsonl <<'PY'
import json, sys, datetime

threshold_pct = float(sys.argv[1])
baseline_path = sys.argv[2]
report_path = sys.argv[3]
raw_path = sys.argv[4]

def load_raw(path):
    out = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                out.append(json.loads(line))
    except FileNotFoundError:
        pass
    return out

endpoints = load_raw(raw_path)

# Build the current report.
current = {
    "commit": "PR",
    "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "soroban_sdk_version": "26.1.0",
    "endpoints": [
        {
            "endpoint": e["endpoint"],
            "cpu_insns": e["cpu_insns"],
            "mem_bytes": e["mem_bytes"],
            "success": True,
            "note": e.get("note", ""),
        }
        for e in endpoints
    ],
}

with open(report_path, "w") as f:
    json.dump(current, f, indent=2)

# Load baseline.
try:
    with open(baseline_path) as f:
        baseline = json.load(f)
    baseline_by_ep = {e["endpoint"]: e for e in baseline.get("endpoints", [])}
except FileNotFoundError:
    baseline_by_ep = {}

# Build markdown report.
md = []
md.append("## Gas & CPU Benchmark Report")
md.append("")
md.append("| Endpoint | Baseline CPU | Current CPU | Δ CPU | Δ % | Status |")
md.append("|----------|-------------|-------------|-------|------|--------|")

has_regression = False
regressed = []

for e in current["endpoints"]:
    ep = e["endpoint"]
    cur = e["cpu_insns"]
    base = baseline_by_ep.get(ep, {}).get("cpu_insns")
    if base is None:
        md.append(f"| `{ep}` | — | {cur} | new | — | 🆕 NEW |")
        continue
    delta = cur - base
    pct = (delta / base * 100.0) if base else 0.0
    if pct > threshold_pct:
        status, flag = "REGRESSION", "🔴"
        has_regression = True
        regressed.append((ep, pct))
    elif pct > 5:
        status, flag = "WARNING", "🟡"
    elif pct < -5:
        status, flag = "OPTIMISED", "🟢"
    else:
        status, flag = "OK", "✅"
    md.append(f"| `{ep}` | {base} | {cur} | {delta:+} | {pct:.1f}% | {flag} {status} |")

md.append("")
if has_regression:
    md.append(f"> ⚠️ **{len(regressed)} endpoint(s) regressed past the {threshold_pct:g}% threshold.**")
    for ep, pct in regressed:
        md.append(f"> - `{ep}`: +{pct:.1f}%")
else:
    md.append(f"> ✅ No endpoint regressed past the {threshold_pct:g}% threshold.")

print("\n".join(md))

sys.exit(1 if has_regression else 0)
PY
