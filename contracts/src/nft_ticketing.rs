use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Map, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TicketMetadata {
    pub event_id: u32,
    pub seat: String,
    pub date: u64,
    pub venue: String,
    pub qr_code_hash: String,
    pub face_value: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Ticket(u32), // ticket_id -> TicketMetadata
    TicketOwner(u32), // ticket_id -> Address
    EventOrganizer(u32), // event_id -> Address
    EventTickets(u32), // event_id -> Vec<u32>
    TicketCounter,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TicketingError {
    NotAuthorized = 1,
    TicketNotFound = 2,
    InvalidPrice = 3,
}

#[contract]
pub struct NftTicketingContract;

#[contractimpl]
impl NftTicketingContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TicketCounter, &0u32);
    }

    pub fn mint_ticket(
        env: Env,
        caller: Address,
        to: Address,
        event_id: u32,
        seat: String,
        date: u64,
        venue: String,
        qr_code_hash: String,
        face_value: i128,
    ) -> u32 {
        caller.require_auth();
        // Assume caller is organizer or admin for simplicity

        let mut counter: u32 = env.storage().instance().get(&DataKey::TicketCounter).unwrap_or(0);
        counter += 1;

        let metadata = TicketMetadata {
            event_id,
            seat,
            date,
            venue,
            qr_code_hash,
            face_value,
        };

        env.storage().instance().set(&DataKey::Ticket(counter), &metadata);
        env.storage().instance().set(&DataKey::TicketOwner(counter), &to);
        env.storage().instance().set(&DataKey::TicketCounter, &counter);

        let mut tickets: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::EventTickets(event_id))
            .unwrap_or(Vec::new(&env));
        tickets.push_back(counter);
        env.storage().instance().set(&DataKey::EventTickets(event_id), &tickets);

        // Emit mint event
        env.events().publish(("Mint", "ticket_id"), (counter, to.clone(), event_id));

        counter
    }

    pub fn get_ticket(env: Env, ticket_id: u32) -> TicketMetadata {
        env.storage()
            .instance()
            .get(&DataKey::Ticket(ticket_id))
            .unwrap_or_else(|| panic_with_error!(&env, TicketingError::TicketNotFound))
    }

    pub fn get_owner(env: Env, ticket_id: u32) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::TicketOwner(ticket_id))
            .unwrap_or_else(|| panic_with_error!(&env, TicketingError::TicketNotFound))
    }

    pub fn transfer_ticket(env: Env, from: Address, to: Address, ticket_id: u32) {
        from.require_auth();
        
        let current_owner: Address = env.storage().instance().get(&DataKey::TicketOwner(ticket_id)).unwrap();
        if from != current_owner {
            panic_with_error!(&env, TicketingError::NotAuthorized);
        }

        env.storage().instance().set(&DataKey::TicketOwner(ticket_id), &to);
        
        env.events().publish(("Transfer", "ticket_id"), (from, to, ticket_id));
    }
}
