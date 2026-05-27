//! Property-based tests for the RS-Token contract.
//!
//! Invariants verified after every operation in a random mint/burn sequence:
//!   1. No individual balance is ever negative.
//!   2. sum(balances[token_id]) == total_minted[token_id] - total_burned[token_id]
//!   3. A burn that would exceed the holder's balance is rejected.

#[cfg(test)]
mod tests {
    use crate::token::{RsTokenContract, RsTokenContractClient};
    use rand::{rngs::SmallRng, Rng, SeedableRng};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    const N_STUDENTS: usize = 4;
    const N_TOKEN_IDS: usize = 3;

    // -----------------------------------------------------------------------
    // Invariant checker
    // -----------------------------------------------------------------------

    fn assert_invariants(
        client: &RsTokenContractClient,
        students: &[Address; N_STUDENTS],
        net: &[i128; N_TOKEN_IDS],
    ) {
        for token_id in 0u32..N_TOKEN_IDS as u32 {
            let mut sum: i128 = 0;
            for (i, student) in students.iter().enumerate() {
                let bal = client.get_balance(student, &token_id);
                assert!(
                    bal >= 0,
                    "negative balance: student={i} token_id={token_id} bal={bal}"
                );
                sum += bal;
            }
            assert_eq!(
                sum, net[token_id as usize],
                "supply invariant broken: token_id={token_id} sum={sum} expected={}",
                net[token_id as usize]
            );
        }
    }

    // -----------------------------------------------------------------------
    // Random sequence runner
    // -----------------------------------------------------------------------

    fn run_sequence(seed: u64, n_ops: usize) {
        let env = Env::default();
        env.mock_all_auths();

        let cert_contract = Address::generate(&env);
        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);
        client.init(&cert_contract);

        let students: [Address; N_STUDENTS] = [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];

        // Mirror state on the host
        let mut balances = [[0i128; N_TOKEN_IDS]; N_STUDENTS];
        let mut net = [0i128; N_TOKEN_IDS];

        let mut rng = SmallRng::seed_from_u64(seed);

        for _ in 0..n_ops {
            let si = rng.gen_range(0..N_STUDENTS);
            let ti = rng.gen_range(0..N_TOKEN_IDS);
            let amount: i128 = rng.gen_range(1..=50);
            let do_mint = rng.gen_bool(0.6);

            if do_mint {
                client.mint(&cert_contract, &students[si], &(ti as u32), &amount);
                balances[si][ti] += amount;
                net[ti] += amount;
            } else {
                let current = balances[si][ti];
                if current >= amount {
                    client.burn(&students[si], &students[si], &(ti as u32), &amount);
                    balances[si][ti] -= amount;
                    net[ti] -= amount;
                }
                // If current < amount the contract would reject it; we skip to keep state clean.
                // Invariant 3 is tested separately in prop_over_burn_always_rejected.
            }

            assert_invariants(&client, &students, &net);
        }
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[test]
    fn prop_token_invariants_seed_1() {
        run_sequence(1, 200);
    }

    #[test]
    fn prop_token_invariants_seed_2() {
        run_sequence(2, 200);
    }

    #[test]
    fn prop_token_invariants_seed_42() {
        run_sequence(42, 200);
    }

    #[test]
    fn prop_token_invariants_seed_999() {
        run_sequence(999, 200);
    }

    /// Invariant 3: a burn exceeding the holder's balance must be rejected.
    #[test]
    #[should_panic]
    fn prop_over_burn_always_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let cert_contract = Address::generate(&env);
        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);
        client.init(&cert_contract);

        let student = Address::generate(&env);
        client.mint(&cert_contract, &student, &0u32, &10i128);
        // Burn 11 when balance is 10 — must panic
        client.burn(&student, &student, &0u32, &11i128);
    }

    /// Supply returns to zero after all minted tokens are burned.
    #[test]
    fn prop_full_burn_zeroes_supply() {
        let env = Env::default();
        env.mock_all_auths();
        let cert_contract = Address::generate(&env);
        let contract_id = env.register(RsTokenContract, ());
        let client = RsTokenContractClient::new(&env, &contract_id);
        client.init(&cert_contract);

        let mut rng = SmallRng::seed_from_u64(7);
        let students: [Address; N_STUDENTS] = [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];

        for s in &students {
            for token_id in 0u32..N_TOKEN_IDS as u32 {
                let amount: i128 = rng.gen_range(1..=100);
                client.mint(&cert_contract, s, &token_id, &amount);
            }
        }

        // Burn everything
        for s in &students {
            for token_id in 0u32..N_TOKEN_IDS as u32 {
                let bal = client.get_balance(s, &token_id);
                if bal > 0 {
                    client.burn(s, s, &token_id, &bal);
                }
            }
        }

        let net = [0i128; N_TOKEN_IDS];
        assert_invariants(&client, &students, &net);
    }
}
