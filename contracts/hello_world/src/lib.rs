#![no_std]

use soroban_sdk::{contract, contractimpl, Env, String, Symbol, Vec};

#[contract]
pub struct HelloWorldContract;

#[contractimpl]
impl HelloWorldContract {
    /// Returns a personalized greeting for the given name.
    /// Example: hello("Alice") -> ["Hello", "Alice"]
    pub fn hello(env: Env, to: Symbol) -> Vec<String> {
        let mut greeting = Vec::new(&env);
        greeting.push_back(String::from_str(&env, "Hello"));
        greeting.push_back(String::from_str(&env, &to.to_string()));
        greeting
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register(HelloWorldContract, ());
        let client = HelloWorldContractClient::new(&env, &contract_id);

        let greeting = client.hello(&Symbol::new(&env, "World"));

        assert_eq!(greeting.len(), 2);
        assert_eq!(greeting.get(0).unwrap(), String::from_str(&env, "Hello"));
        assert_eq!(greeting.get(1).unwrap(), String::from_str(&env, "World"));
    }
}
