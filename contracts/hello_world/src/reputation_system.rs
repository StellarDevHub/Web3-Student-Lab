use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String, Symbol, Vec};

const KEY_REPUTATION: Symbol = Symbol::new("reputation");
const KEY_REVIEWS: Symbol = Symbol::new("reviews");
const KEY_JOB_HISTORY: Symbol = Symbol::new("job_history");

#[contracttype]
#[derive(Clone, Debug)]
pub struct Review {
    pub job_id: u64,
    pub reviewer: Address,
    pub reviewee: Address,
    pub rating: u32, // 1-5 stars
    pub comment: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Reputation {
    pub total_score: u64,
    pub review_count: u64,
    pub average_rating: u32,
    pub last_updated: u64,
    pub completed_jobs: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReputationUpdatedEvent {
    pub user: Address,
    pub new_average: u32,
    pub total_reviews: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReviewSubmittedEvent {
    pub job_id: u64,
    pub reviewer: Address,
    pub reviewee: Address,
    pub rating: u32,
    pub timestamp: u64,
}

const DECAY_PERIOD_SECONDS: u64 = 30 * 24 * 60 * 60; // 30 days
const DECAY_RATE: u64 = 10; // 10% decay per period

#[contract]
pub struct ReputationSystem;

#[contractimpl]
impl ReputationSystem {
    /// Initialize the reputation system
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&KEY_REPUTATION) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&KEY_REPUTATION, &Map::<Address, Reputation>::new(&env));
        env.storage().instance().set(&KEY_REVIEWS, &Vec::<Review>::new(&env));
        env.storage().instance().set(&KEY_JOB_HISTORY, &Map::<Address, Vec<u64>>::new(&env));
    }

    /// Submit a review after job completion
    pub fn submit_review(
        env: Env,
        job_id: u64,
        reviewer: Address,
        reviewee: Address,
        rating: u32,
        comment: String,
    ) {
        reviewer.require_auth();

        if rating < 1 || rating > 5 {
            panic!("Rating must be between 1 and 5");
        }

        let review = Review {
            job_id,
            reviewer: reviewer.clone(),
            reviewee: reviewee.clone(),
            rating,
            comment,
            timestamp: env.ledger().timestamp(),
        };

        // Store review
        let mut reviews: Vec<Review> = env.storage().instance().get(&KEY_REVIEWS).unwrap_or(Vec::new(&env));
        reviews.push_back(review);
        env.storage().instance().set(&KEY_REVIEWS, &reviews);

        // Update reputation
        let mut reputations: Map<Address, Reputation> = env.storage().instance().get(&KEY_REPUTATION).unwrap_or(Map::new(&env));

        let mut rep = reputations.get(reviewee.clone()).unwrap_or(Reputation {
            total_score: 0,
            review_count: 0,
            average_rating: 0,
            last_updated: 0,
            completed_jobs: 0,
        });

        rep.total_score += rating as u64;
        rep.review_count += 1;
        rep.average_rating = ((rep.total_score * 100) / rep.review_count) as u32;
        rep.last_updated = env.ledger().timestamp();

        // Track job history
        let mut history: Map<Address, Vec<u64>> = env.storage().instance().get(&KEY_JOB_HISTORY).unwrap_or(Map::new(&env));
        let mut jobs = history.get(reviewee.clone()).unwrap_or(Vec::new(&env));
        if !jobs.contains(&job_id) {
            jobs.push_back(job_id);
            rep.completed_jobs = jobs.len() as u64;
        }
        history.set(reviewee.clone(), jobs);
        env.storage().instance().set(&KEY_JOB_HISTORY, &history);

        reputations.set(reviewee.clone(), rep);
        env.storage().instance().set(&KEY_REPUTATION, &reputations);

        env.events().publish(
            (Symbol::new(&env, "review_submitted"),),
            ReviewSubmittedEvent {
                job_id,
                reviewer,
                reviewee: reviewee.clone(),
                rating,
                timestamp: env.ledger().timestamp(),
            },
        );

        env.events().publish(
            (Symbol::new(&env, "reputation_updated"),),
            ReputationUpdatedEvent {
                user: reviewee,
                new_average: rep.average_rating,
                total_reviews: rep.review_count,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Get reputation for a user with time-based decay
    pub fn get_reputation(env: Env, user: Address) -> Reputation {
        let reputations: Map<Address, Reputation> = env.storage().instance().get(&KEY_REPUTATION).unwrap_or(Map::new(&env));
        let rep = reputations.get(user.clone()).unwrap_or(Reputation {
            total_score: 0,
            review_count: 0,
            average_rating: 0,
            last_updated: 0,
            completed_jobs: 0,
        });

        // Apply time-based decay
        let now = env.ledger().timestamp();
        if rep.last_updated > 0 && now > rep.last_updated {
            let periods = (now - rep.last_updated) / DECAY_PERIOD_SECONDS;
            if periods > 0 {
                let decayed_rating = (rep.average_rating as u64)
                    .saturating_sub(periods * DECAY_RATE);
                return Reputation {
                    total_score: rep.total_score,
                    review_count: rep.review_count,
                    average_rating: decayed_rating as u32,
                    last_updated: rep.last_updated,
                    completed_jobs: rep.completed_jobs,
                };
            }
        }

        rep
    }

    /// Get all reviews for a user
    pub fn get_reviews(env: Env, user: Address) -> Vec<Review> {
        let reviews: Vec<Review> = env.storage().instance().get(&KEY_REVIEWS).unwrap_or(Vec::new(&env));
        let mut result = Vec::new(&env);
        for review in reviews.iter() {
            if review.reviewee == user {
                result.push_back(review);
            }
        }
        result
    }

    /// Get completed job count for a user
    pub fn get_completed_jobs(env: Env, user: Address) -> u64 {
        let history: Map<Address, Vec<u64>> = env.storage().instance().get(&KEY_JOB_HISTORY).unwrap_or(Map::new(&env));
        let jobs = history.get(user).unwrap_or(Vec::new(&env));
        jobs.len() as u64
    }
}
