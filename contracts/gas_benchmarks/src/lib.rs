#![no_std]
// This crate is a pure benchmark/test harness. It is never deployed as a
// contract, so allow dead code / unused imports when built without `--test`.
#![cfg_attr(not(test), allow(dead_code, unused_imports))]

extern crate alloc;

// ── Re-export contract crates for benchmark consumers ────────────────────────
pub use certificate_nft;
pub use dao_governance;
pub use payment_gateway;
pub use smart_vault;
pub use soroban_hello_world as hello_world;

pub mod harness;

#[cfg(test)]
pub mod benchmarks;

pub use harness::{BenchmarkReport, EndpointMetrics, RegressionCheck};
