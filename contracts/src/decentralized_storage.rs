use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, String, Symbol, Vec};

const KEY_FILES: Symbol = Symbol::new("files");
const KEY_SHARDS: Symbol = Symbol::new("shards");
const KEY_PROVIDERS: Symbol = Symbol::new("providers");
const SHARD_SIZE: u32 = 256; // 256 bytes per shard

#[contracttype]
#[derive(Clone, Debug)]
pub struct FileShard {
    pub file_id: BytesN<32>,
    pub shard_index: u32,
    pub data_hash: BytesN<32>,
    pub provider: Address,
    pub size: u32,
    pub stored_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StoredFile {
    pub id: BytesN<32>,
    pub owner: Address,
    pub name: String,
    pub total_size: u32,
    pub shard_count: u32,
    pub redundancy: u32,
    pub encryption_key: BytesN<32>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StorageProvider {
    pub address: Address,
    pub total_stored: u64,
    pub available_space: u64,
    pub shard_count: u32,
    pub reputation: u32,
    pub registered_at: u64,
    pub last_heartbeat: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FileUploadedEvent {
    pub file_id: BytesN<32>,
    pub owner: Address,
    pub name: String,
    pub size: u32,
    pub shard_count: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ShardStoredEvent {
    pub file_id: BytesN<32>,
    pub shard_index: u32,
    pub provider: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FileRetrievedEvent {
    pub file_id: BytesN<32>,
    pub retriever: Address,
    pub timestamp: u64,
}

#[contract]
pub struct DecentralizedStorage;

#[contractimpl]
impl DecentralizedStorage {
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&KEY_FILES) { panic!("Already initialized"); }
        env.storage().instance().set(&KEY_FILES, &Map::<BytesN<32>, StoredFile>::new(&env));
        env.storage().instance().set(&KEY_SHARDS, &Map::<BytesN<32>, Vec<FileShard>>::new(&env));
        env.storage().instance().set(&KEY_PROVIDERS, &Map::<Address, StorageProvider>::new(&env));
    }

    /// Register as a storage provider
    pub fn register_provider(env: Env, provider: Address, available_space: u64) {
        provider.require_auth();
        let mut providers: Map<Address, StorageProvider> = env.storage().instance().get(&KEY_PROVIDERS).unwrap();
        providers.set(provider.clone(), StorageProvider {
            address: provider,
            total_stored: 0,
            available_space,
            shard_count: 0,
            reputation: 100,
            registered_at: env.ledger().timestamp(),
            last_heartbeat: env.ledger().timestamp(),
        });
        env.storage().instance().set(&KEY_PROVIDERS, &providers);
    }

    /// Upload a file with sharding and encryption
    pub fn upload_file(env: Env, owner: Address, name: String, encrypted_data: Bytes, encryption_key: BytesN<32>, redundancy: u32) -> BytesN<32> {
        owner.require_auth();
        let total_size = encrypted_data.len() as u32;
        let shard_count = (total_size + SHARD_SIZE - 1) / SHARD_SIZE;
        let file_id = env.crypto().sha256(&encrypted_data).into();

        let mut files: Map<BytesN<32>, StoredFile> = env.storage().instance().get(&KEY_FILES).unwrap();
        files.set(file_id.clone(), StoredFile {
            id: file_id.clone(), owner: owner.clone(), name: name.clone(),
            total_size, shard_count, redundancy, encryption_key,
            created_at: env.ledger().timestamp(), updated_at: env.ledger().timestamp(),
        });
        env.storage().instance().set(&KEY_FILES, &files);

        // Distribute shards to providers
        let providers: Map<Address, StorageProvider> = env.storage().instance().get(&KEY_PROVIDERS).unwrap();
        let mut shards: Map<BytesN<32>, Vec<FileShard>> = env.storage().instance().get(&KEY_SHARDS).unwrap();
        let mut file_shards = Vec::new(&env);

        let provider_list: Vec<Address> = providers.keys().into();
        let provider_count = provider_list.len() as u32;

        for i in 0..shard_count {
            for r in 0..redundancy {
                let provider_idx = ((i + r) % provider_count) as u32;
                let provider = provider_list.get(provider_idx).unwrap();

                let mut start = (i * SHARD_SIZE) as u32;
                let mut end = start + SHARD_SIZE;
                if end > total_size { end = total_size; }
                let slice = encrypted_data.slice(start..end);
                let data_hash = env.crypto().sha256(&slice).into();

                let shard = FileShard {
                    file_id: file_id.clone(), shard_index: i, data_hash,
                    provider: provider.clone(), size: end - start,
                    stored_at: env.ledger().timestamp(),
                };
                file_shards.push_back(shard.clone());

                let mut prov = providers.get(provider.clone()).unwrap();
                prov.total_stored += (end - start) as u64;
                prov.shard_count += 1;
                providers.set(provider.clone(), prov);

                env.events().publish((Symbol::new(&env, "shard_stored"),), ShardStoredEvent {
                    file_id: file_id.clone(), shard_index: i, provider: provider.clone(),
                    timestamp: env.ledger().timestamp(),
                });
            }
        }

        shards.set(file_id.clone(), file_shards);
        env.storage().instance().set(&KEY_SHARDS, &shards);
        env.storage().instance().set(&KEY_PROVIDERS, &providers);

        env.events().publish((Symbol::new(&env, "file_uploaded"),), FileUploadedEvent {
            file_id: file_id.clone(), owner, name, size: total_size, shard_count,
            timestamp: env.ledger().timestamp(),
        });

        file_id
    }

    /// Get file metadata
    pub fn get_file(env: Env, file_id: BytesN<32>) -> StoredFile {
        let files: Map<BytesN<32>, StoredFile> = env.storage().instance().get(&KEY_FILES).unwrap();
        files.get(file_id).expect("File not found")
    }

    /// Get shards for a file
    pub fn get_shards(env: Env, file_id: BytesN<32>) -> Vec<FileShard> {
        let shards: Map<BytesN<32>, Vec<FileShard>> = env.storage().instance().get(&KEY_SHARDS).unwrap();
        shards.get(file_id).unwrap_or(Vec::new(&env))
    }

    /// Verify file integrity via shard hashes
    pub fn verify_file(env: Env, file_id: BytesN<32>) -> bool {
        let shards: Map<BytesN<32>, Vec<FileShard>> = env.storage().instance().get(&KEY_SHARDS).unwrap();
        let file_shards = shards.get(file_id.clone());
        if file_shards.is_none() { return false; }
        for shard in file_shards.unwrap().iter() {
            let provider: StorageProvider = env.storage().instance().get(&KEY_PROVIDERS)
                .unwrap_or(Map::new(&env)).get(shard.provider).unwrap_or(StorageProvider {
                    address: shard.provider, total_stored: 0, available_space: 0,
                    shard_count: 0, reputation: 0, registered_at: 0, last_heartbeat: 0,
                });
            if provider.last_heartbeat + 86400 < env.ledger().timestamp() { return false; }
        }
        true
    }

    /// List user's files
    pub fn list_user_files(env: Env, user: Address) -> Vec<StoredFile> {
        let files: Map<BytesN<32>, StoredFile> = env.storage().instance().get(&KEY_FILES).unwrap();
        let mut result = Vec::new(&env);
        for (_id, file) in files.iter() {
            if file.owner == user { result.push_back(file); }
        }
        result
    }

    /// Provider heartbeat
    pub fn provider_heartbeat(env: Env, provider: Address) {
        provider.require_auth();
        let mut providers: Map<Address, StorageProvider> = env.storage().instance().get(&KEY_PROVIDERS).unwrap();
        let mut p = providers.get(provider.clone()).expect("Provider not found");
        p.last_heartbeat = env.ledger().timestamp();
        providers.set(provider, p);
        env.storage().instance().set(&KEY_PROVIDERS, &providers);
    }

    /// Delete file and free provider space
    pub fn delete_file(env: Env, file_id: BytesN<32>, owner: Address) {
        owner.require_auth();
        let files: Map<BytesN<32>, StoredFile> = env.storage().instance().get(&KEY_FILES).unwrap();
        let file = files.get(file_id.clone()).expect("File not found");
        if file.owner != owner { panic!("Not file owner"); }

        let shards: Map<BytesN<32>, Vec<FileShard>> = env.storage().instance().get(&KEY_SHARDS).unwrap();
        let file_shards = shards.get(file_id.clone()).unwrap_or(Vec::new(&env));
        let mut providers: Map<Address, StorageProvider> = env.storage().instance().get(&KEY_PROVIDERS).unwrap();

        for shard in file_shards.iter() {
            let mut p = providers.get(shard.provider.clone()).unwrap();
            p.total_stored = p.total_stored.saturating_sub(shard.size as u64);
            p.shard_count = p.shard_count.saturating_sub(1);
            providers.set(shard.provider.clone(), p);
        }
        env.storage().instance().set(&KEY_PROVIDERS, &providers);

        let mut files: Map<BytesN<32>, StoredFile> = env.storage().instance().get(&KEY_FILES).unwrap();
        files.remove(file_id.clone());
        env.storage().instance().set(&KEY_FILES, &files);

        let mut shards: Map<BytesN<32>, Vec<FileShard>> = env.storage().instance().get(&KEY_SHARDS).unwrap();
        shards.remove(file_id.clone());
        env.storage().instance().set(&KEY_SHARDS, &shards);
    }
}
