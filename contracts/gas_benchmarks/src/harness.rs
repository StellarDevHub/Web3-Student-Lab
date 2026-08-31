use alloc::string::String;
use alloc::vec::Vec;
use soroban_sdk::Env;

// ── Metrics snapshot ────────────────────────────────────────────────────────

/// Raw resource consumption snapshot captured from `Env::budget()`.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ResourceSnapshot {
    /// CPU instructions consumed.
    pub cpu_insns: u64,
    /// Memory bytes allocated.
    pub mem_bytes: u64,
}

impl ResourceSnapshot {
    /// Capture a fresh snapshot from the environment's budget counters.
    pub fn capture(env: &Env) -> Self {
        let budget = env.cost_estimate().budget();
        Self {
            cpu_insns: budget.cpu_instruction_cost(),
            mem_bytes: budget.memory_bytes_cost(),
        }
    }

    /// Compute the delta between two snapshots (post - pre).
    pub fn delta(&self, other: &Self) -> Self {
        Self {
            cpu_insns: self.cpu_insns.saturating_sub(other.cpu_insns),
            mem_bytes: self.mem_bytes.saturating_sub(other.mem_bytes),
        }
    }
}

// ── Per-endpoint metrics ────────────────────────────────────────────────────

/// Benchmark metrics for a single contract endpoint call.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct EndpointMetrics {
    /// Fully qualified endpoint identifier, e.g. "hello_world::hello".
    pub endpoint: String,
    /// CPU instructions consumed by this call.
    pub cpu_insns: u64,
    /// Memory bytes consumed by this call.
    pub mem_bytes: u64,
    /// Whether the call succeeded.
    pub success: bool,
    /// Optional human-readable note.
    pub note: String,
}

// ── Benchmark report ────────────────────────────────────────────────────────

/// Full benchmark report for a single run across all contract endpoints.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct BenchmarkReport {
    /// Git commit hash this benchmark was run against.
    pub commit: String,
    /// ISO-8601 timestamp of the run.
    pub timestamp: String,
    /// Soroban SDK version used.
    pub soroban_sdk_version: String,
    /// All endpoint metrics collected in this run.
    pub endpoints: Vec<EndpointMetrics>,
}

impl BenchmarkReport {
    /// Serialise the report to a JSON string.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Render the report as a Markdown table suitable for GitHub PR comments.
    pub fn to_markdown(&self) -> String {
        let mut md = alloc::string::String::new();
        md.push_str("## Gas Benchmark Report\n\n");
        md.push_str(&alloc::format!(
            "**Commit:** `{}`  \n**SDK:** soroban-sdk {}  \n**Timestamp:** {}\n\n",
            self.commit,
            self.soroban_sdk_version,
            self.timestamp,
        ));
        md.push_str("| Endpoint | CPU Insns | Mem Bytes | OK |\n");
        md.push_str("|----------|-----------|-----------|-----|\n");
        for ep in &self.endpoints {
            md.push_str(&alloc::format!(
                "| `{}` | {} | {} | {} |\n",
                ep.endpoint,
                ep.cpu_insns,
                ep.mem_bytes,
                if ep.success { "✅" } else { "❌" },
            ));
        }
        md
    }

    /// Render a regression comparison between this report and a baseline.
    pub fn regression_markdown(&self, baseline: &BenchmarkReport) -> String {
        let mut md = alloc::string::String::new();
        md.push_str("## Gas Regression Analysis\n\n");
        md.push_str("| Endpoint | Baseline CPU | Current CPU | Δ CPU | Δ % | Status |\n");
        md.push_str("|----------|-------------|-------------|-------|-----|--------|\n");

        let mut has_regression = false;

        for current in &self.endpoints {
            if let Some(base) = baseline
                .endpoints
                .iter()
                .find(|b| b.endpoint == current.endpoint)
            {
                let delta_cpu = current.cpu_insns as i64 - base.cpu_insns as i64;
                let pct = if base.cpu_insns > 0 {
                    (delta_cpu as f64 / base.cpu_insns as f64) * 100.0
                } else {
                    0.0
                };

                let (status, flag) = if pct > 10.0 {
                    has_regression = true;
                    ("REGRESSION", "🔴")
                } else if pct > 5.0 {
                    ("WARNING", "🟡")
                } else if pct < -5.0 {
                    ("OPTIMISED", "🟢")
                } else {
                    ("OK", "✅")
                };

                md.push_str(&alloc::format!(
                    "| `{}` | {} | {} | {:+} | {:.1}% | {} {} |\n",
                    current.endpoint,
                    base.cpu_insns,
                    current.cpu_insns,
                    delta_cpu,
                    pct,
                    flag,
                    status,
                ));
            } else {
                md.push_str(&alloc::format!(
                    "| `{}` | — | {} | new | — | 🆕 NEW |\n",
                    current.endpoint,
                    current.cpu_insns,
                ));
            }
        }

        // Check for removed endpoints
        for base in &baseline.endpoints {
            if !self.endpoints.iter().any(|c| c.endpoint == base.endpoint) {
                md.push_str(&alloc::format!(
                    "| `{}` | {} | — | removed | — | ❌ REMOVED |\n",
                    base.endpoint,
                    base.cpu_insns,
                ));
            }
        }

        md.push('\n');
        if has_regression {
            md.push_str("> ⚠️ **Regressions detected exceeding the 10% threshold.** Please investigate before merging.\n");
        } else {
            md.push_str("> ✅ **No regressions detected.** All endpoints are within acceptable thresholds.\n");
        }
        md
    }
}

// ── Regression checker ──────────────────────────────────────────────────────

/// Result of comparing a current benchmark against a baseline.
#[derive(Clone, Debug)]
pub struct RegressionCheck {
    /// Whether any endpoint regressed by more than the threshold.
    pub has_regression: bool,
    /// Per-endpoint regression percentages.
    pub regressions: Vec<(String, f64)>,
    /// The full comparison markdown.
    pub markdown: String,
}

impl RegressionCheck {
    /// Compare `current` against `baseline` with the given threshold (0.0–1.0).
    pub fn compare(current: &BenchmarkReport, baseline: &BenchmarkReport, threshold: f64) -> Self {
        let mut regressions = Vec::new();
        let mut has_regression = false;

        for ep in &current.endpoints {
            if let Some(base) = baseline
                .endpoints
                .iter()
                .find(|b| b.endpoint == ep.endpoint)
            {
                if base.cpu_insns > 0 {
                    let delta = ep.cpu_insns as i64 - base.cpu_insns as i64;
                    let pct = (delta as f64 / base.cpu_insns as f64) * 100.0;
                    if pct > threshold * 100.0 {
                        has_regression = true;
                        regressions.push((ep.endpoint.clone(), pct));
                    }
                }
            }
        }

        let markdown = current.regression_markdown(baseline);

        Self {
            has_regression,
            regressions,
            markdown,
        }
    }
}

// ── Utility: run a closure and measure its budget ──────────────────────────

/// Reset the environment's budget tracker so subsequent measurements capture
/// only the cost of the next call.
pub fn reset_budget(env: &Env) {
    let mut budget = env.cost_estimate().budget();
    budget.reset_tracker();
}
