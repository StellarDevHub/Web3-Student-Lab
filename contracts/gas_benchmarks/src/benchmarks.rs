use alloc::string::{String, ToString};
use alloc::vec;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{Address, Env, String as SorobanString};

use crate::harness::{BenchmarkReport, EndpointMetrics};

// Tests run under the std test harness; declare std explicitly since the crate
// root is `#![no_std]`.
extern crate std;

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Measure the CPU/mem cost of invoking `f` inside a fresh budget frame.
///
/// Returns `(cpu_insns, mem_bytes)`. We reset the tracker immediately before
/// executing `f` so the accumulated counters reflect only this call.
fn measure<F: FnOnce()>(env: &Env, f: F) -> (u64, u64) {
    let mut budget = env.cost_estimate().budget();
    budget.reset_tracker();
    f();
    let cpu = budget.cpu_instruction_cost();
    let mem = budget.memory_bytes_cost();
    (cpu, mem)
}

fn ts() -> String {
    "2026-08-31T00:00:00Z".to_string()
}

fn commit_hash() -> String {
    "HEAD".to_string()
}

/// Emit a machine-readable metric line for CI report collection.
///
/// Each benchmark, after measuring an endpoint, calls `record(...)` which
/// prints a single-line JSON object tagged `__GAS_BENCH__`. The CI workflow
/// greps for these tags to assemble the Markdown comparison report.
fn record(endpoint: &str, cpu: u64, mem: u64, note: &str) {
    std::println!(
        "__GAS_BENCH__ {{\"endpoint\":\"{}\",\"cpu_insns\":{},\"mem_bytes\":{},\"note\":\"{}\"}}",
        endpoint,
        cpu,
        mem,
        note
    );
}

fn mk(endpoint: &str, cpu: u64, mem: u64, success: bool, note: &str) -> EndpointMetrics {
    EndpointMetrics {
        endpoint: endpoint.to_string(),
        cpu_insns: cpu,
        mem_bytes: mem,
        success,
        note: note.to_string(),
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  hello_world
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bench_hello_world_hello() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::hello_world::HelloWorldContract, ());
    let client = crate::hello_world::HelloWorldContractClient::new(&env, &contract_id);
    let to = SorobanString::from_str(&env, "Benchmark");

    let (cpu, mem) = measure(&env, || {
        let _ = client.hello(&to);
    });

    assert!(cpu > 0, "CPU insns must be non-zero, got {cpu}");
    assert!(mem > 0, "Mem bytes must be non-zero, got {mem}");

    record("hello_world::hello", cpu, mem, "Returns greeting vec");
}

// ═════════════════════════════════════════════════════════════════════════════
//  certificate_nft
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bench_certificate_nft_mint() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::certificate_nft::CertificateNFTContract, ());
    let client = crate::certificate_nft::CertificateNFTContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    let course_id = SorobanString::from_str(&env, "NFT-BENCH");
    let grade = SorobanString::from_str(&env, "A");
    let uri = SorobanString::from_str(&env, "ipfs://bench");

    let (cpu, mem) = measure(&env, || {
        client.mint_certificate(&admin, &student, &course_id, &grade, &uri)
    });
    assert!(cpu > 0);
    record(
        "certificate_nft::mint_certificate",
        cpu,
        mem,
        "Mints NFT certificate",
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  smart_vault
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bench_smart_vault_endpoints() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::smart_vault::SmartVault, ());
    let client = crate::smart_vault::SmartVaultClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let (cpu, mem) = measure(&env, || client.deposit(&user, &1_000_000));
    assert!(cpu > 0);
    record(
        "smart_vault::deposit",
        cpu,
        mem,
        "Deposits tokens for shares",
    );

    // shares_of
    let (cpu, mem) = measure(&env, || {
        let shares = client.shares_of(&user);
        assert_eq!(shares, 1_000_000);
    });
    assert!(cpu > 0);
    record("smart_vault::shares_of", cpu, mem, "Views user shares");

    // assets_of
    let (cpu, mem) = measure(&env, || {
        let assets = client.assets_of(&user);
        assert_eq!(assets, 1_000_000);
    });
    assert!(cpu > 0);
    record("smart_vault::assets_of", cpu, mem, "Views user asset value");

    // withdraw
    let (cpu, mem) = measure(&env, || {
        let withdrawn = client.withdraw(&user, &500_000);
        assert_eq!(withdrawn, 500_000);
    });
    assert!(cpu > 0);
    record(
        "smart_vault::withdraw",
        cpu,
        mem,
        "Withdraws proportional assets",
    );

    // stake
    let (cpu, mem) = measure(&env, || client.stake(&user));
    assert!(cpu > 0);
    record("smart_vault::stake", cpu, mem, "Marks vault as staked");

    // harvest (needs ledger advanced past cooldown + staked)
    env.ledger().with_mut(|l| l.sequence_number += 200);
    let (cpu, mem) = measure(&env, || {
        let reward = client.harvest(&user);
        assert!(reward > 0, "expected positive reward");
    });
    assert!(cpu > 0);
    record("smart_vault::harvest", cpu, mem, "Harvests accrued rewards");

    // compound
    env.ledger().with_mut(|l| l.sequence_number += 200);
    let (cpu, mem) = measure(&env, || {
        let new_shares = client.compound(&user);
        assert!(new_shares > 0);
    });
    assert!(cpu > 0);
    record(
        "smart_vault::compound",
        cpu,
        mem,
        "Harvest + auto-redeposit",
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  dao_governance
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bench_dao_governance_endpoints() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::dao_governance::DaoGovernance, ());
    let client = crate::dao_governance::DaoGovernanceClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let (cpu, mem) = measure(&env, || client.initialize(&admin));
    assert!(cpu > 0);
    record("dao_governance::initialize", cpu, mem, "Initialises DAO");

    let member = Address::generate(&env);
    let (cpu, mem) = measure(&env, || client.grant_credits(&member, &1000u128));
    assert!(cpu > 0);
    record(
        "dao_governance::grant_credits",
        cpu,
        mem,
        "Grants voice credits",
    );

    let title = SorobanString::from_str(&env, "Benchmark");
    let desc = SorobanString::from_str(&env, "Test proposal");
    let (cpu, mem) = measure(&env, || {
        let _pid = client.create_proposal(&admin, &title, &desc, &3600);
    });
    assert!(cpu > 0);
    let pid: u64 = client.create_proposal(&admin, &title, &desc, &3600);
    record(
        "dao_governance::create_proposal",
        cpu,
        mem,
        "Creates proposal",
    );

    let (cpu, mem) = measure(&env, || client.vote(&member, &pid, &3i64));
    assert!(cpu > 0);
    record("dao_governance::vote", cpu, mem, "Quadratic vote");

    env.ledger().with_mut(|l| l.timestamp += 4000);
    let (cpu, mem) = measure(&env, || client.finalize(&pid));
    assert!(cpu > 0);
    record("dao_governance::finalize", cpu, mem, "Finalizes proposal");

    let (cpu, mem) = measure(&env, || client.execute(&admin, &pid));
    assert!(cpu > 0);
    record(
        "dao_governance::execute",
        cpu,
        mem,
        "Executes passed proposal",
    );

    let (cpu, mem) = measure(&env, || {
        let p = client.get_proposal(&pid);
        assert!(p.is_some());
    });
    assert!(cpu > 0);
    record("dao_governance::get_proposal", cpu, mem, "Views proposal");

    let (cpu, mem) = measure(&env, || {
        let _ = client.credits_of(&member);
    });
    assert!(cpu > 0);
    record(
        "dao_governance::credits_of",
        cpu,
        mem,
        "Views member credits",
    );

    let (cpu, mem) = measure(&env, || {
        let _ = client.vote_of(&pid, &member);
    });
    assert!(cpu > 0);
    record("dao_governance::vote_of", cpu, mem, "Views voter record");
}

// ═════════════════════════════════════════════════════════════════════════════
//  payment_gateway
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bench_payment_gateway_endpoints() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::payment_gateway::PaymentGateway, ());
    let client = crate::payment_gateway::PaymentGatewayClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let payee = Address::generate(&env);

    let (cpu, mem) = measure(&env, || client.initialize(&admin));
    assert!(cpu > 0);
    record(
        "payment_gateway::initialize",
        cpu,
        mem,
        "Initialises gateway",
    );

    let (cpu, mem) = measure(&env, || client.deposit(&user, &10_000));
    assert!(cpu > 0);
    record("payment_gateway::deposit", cpu, mem, "Deposits tokens");

    let (cpu, mem) = measure(&env, || {
        let bal = client.get_balance(&user);
        assert_eq!(bal, 10_000);
    });
    assert!(cpu > 0);
    record("payment_gateway::get_balance", cpu, mem, "Views balance");

    let metadata = soroban_sdk::symbol_short!("test");
    let (cpu, mem) = measure(&env, || {
        let _ = client.process_payment(&user, &payee, &1_000, &metadata, &1u64);
    });
    assert!(cpu > 0);
    record(
        "payment_gateway::process_payment",
        cpu,
        mem,
        "Processes payment with fee",
    );

    let (cpu, mem) = measure(&env, || {
        let _ = client.get_payment(&1u64);
    });
    assert!(cpu > 0);
    record(
        "payment_gateway::get_payment",
        cpu,
        mem,
        "Views payment record",
    );

    let (cpu, mem) = measure(&env, || {
        let _ = client.get_admin();
    });
    assert!(cpu > 0);
    record("payment_gateway::get_admin", cpu, mem, "Views admin");

    let (cpu, mem) = measure(&env, || {
        let paused = client.is_paused();
        assert!(!paused);
    });
    assert!(cpu > 0);
    record(
        "payment_gateway::is_paused",
        cpu,
        mem,
        "Checks pause status",
    );

    let (cpu, mem) = measure(&env, || {
        let withdrawn = client.withdraw(&user, &500);
        assert_eq!(withdrawn, 500);
    });
    assert!(cpu > 0);
    record("payment_gateway::withdraw", cpu, mem, "Withdraws tokens");

    let (cpu, mem) = measure(&env, || {
        let _ = client.refund(&user, &1u64);
    });
    assert!(cpu > 0);
    record("payment_gateway::refund", cpu, mem, "Refunds payment");

    let (cpu, mem) = measure(&env, || client.pause(&admin));
    assert!(cpu > 0);
    record("payment_gateway::pause", cpu, mem, "Pauses gateway");

    let (cpu, mem) = measure(&env, || client.unpause(&admin));
    assert!(cpu > 0);
    record("payment_gateway::unpause", cpu, mem, "Unpauses gateway");

    let (cpu, mem) = measure(&env, || client.update_fee_bps(&admin, &100u32));
    assert!(cpu > 0);
    record(
        "payment_gateway::update_fee_bps",
        cpu,
        mem,
        "Updates fee basis points",
    );

    let new_admin = Address::generate(&env);
    let (cpu, mem) = measure(&env, || client.transfer_admin(&admin, &new_admin));
    assert!(cpu > 0);
    record(
        "payment_gateway::transfer_admin",
        cpu,
        mem,
        "Transfers admin role",
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Report & regression unit tests (verify harness logic)
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn report_serialises_to_json_and_markdown() {
    let report = BenchmarkReport {
        commit: commit_hash(),
        timestamp: ts(),
        soroban_sdk_version: "26.1.0".to_string(),
        endpoints: vec![mk("hello_world::hello", 1000, 500, true, "greeting")],
    };

    let json = report.to_json();
    assert!(json.contains("hello_world::hello"));
    assert!(json.contains("cpu_insns"));

    let md = report.to_markdown();
    assert!(md.contains("Gas Benchmark Report"));
    assert!(md.contains("hello_world::hello"));
}

#[test]
fn regression_check_flags_over_threshold() {
    let baseline = BenchmarkReport {
        commit: "base".to_string(),
        timestamp: ts(),
        soroban_sdk_version: "26.1.0".to_string(),
        endpoints: vec![mk("a::b", 100, 50, true, "")],
    };

    // 30% regression => over 10% threshold
    let current = BenchmarkReport {
        commit: "head".to_string(),
        timestamp: ts(),
        soroban_sdk_version: "26.1.0".to_string(),
        endpoints: vec![mk("a::b", 130, 60, true, "")],
    };

    let check = crate::harness::RegressionCheck::compare(&current, &baseline, 0.10);
    assert!(check.has_regression, "expected regression to be detected");
    assert_eq!(check.regressions.len(), 1);
    assert!((check.regressions[0].1 - 30.0).abs() < 1e-6);
    assert!(check.markdown.contains("REGRESSION"));
}

#[test]
fn regression_check_passes_within_threshold() {
    let baseline = BenchmarkReport {
        commit: "base".to_string(),
        timestamp: ts(),
        soroban_sdk_version: "26.1.0".to_string(),
        endpoints: vec![mk("a::b", 100, 50, true, "")],
    };

    // 3% change => within threshold
    let current = BenchmarkReport {
        commit: "head".to_string(),
        timestamp: ts(),
        soroban_sdk_version: "26.1.0".to_string(),
        endpoints: vec![mk("a::b", 103, 60, true, "")],
    };

    let check = crate::harness::RegressionCheck::compare(&current, &baseline, 0.10);
    assert!(!check.has_regression);
}
