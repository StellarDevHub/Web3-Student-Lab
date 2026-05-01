use soroban_sdk::{
    contracttype, Address, Env, String, Symbol, Vec, BytesN,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlogPost {
    pub id: u64,
    pub author: Address,
    pub title: String,
    pub content_hash: BytesN<32>,
    pub timestamp: u64,
    pub metadata: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Comment {
    pub author: Address,
    pub content: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ReactionType {
    Like,
    Love,
    Insightful,
    Funny,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostMetrics {
    pub views: u64,
    pub reactions: u64, // Total
    pub comments: u64,
    pub like_count: u64,
    pub love_count: u64,
    pub insightful_count: u64,
    pub funny_count: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum BloggingDataKey {
    Post(u64),
    PostComments(u64),
    PostReactions(u64),
    PostMetrics(u64),
    AuthorPosts(Address),
    NextPostId,
    LatestPosts,
}

pub struct BloggingPlatform;

impl BloggingPlatform {
    pub fn create_post(env: &Env, author: Address, title: String, content_hash: BytesN<32>, metadata: String) -> u64 {
        author.require_auth();

        let id: u64 = env.storage().instance().get(&BloggingDataKey::NextPostId).unwrap_or(0);
        let post = BlogPost {
            id,
            author: author.clone(),
            title,
            content_hash,
            timestamp: env.ledger().timestamp(),
            metadata,
        };

        env.storage().persistent().set(&BloggingDataKey::Post(id), &post);
        env.storage().instance().set(&BloggingDataKey::NextPostId, &(id + 1));

        // Initialize metrics
        let metrics = PostMetrics { 
            views: 0, 
            reactions: 0, 
            comments: 0,
            like_count: 0,
            love_count: 0,
            insightful_count: 0,
            funny_count: 0,
        };
        env.storage().persistent().set(&BloggingDataKey::PostMetrics(id), &metrics);

        // Indexing for feed
        let mut latest: Vec<u64> = env.storage().persistent().get(&BloggingDataKey::LatestPosts).unwrap_or_else(|| Vec::new(env));
        latest.push_front(id);
        if latest.len() > 100 {
            latest.pop_back();
        }
        env.storage().persistent().set(&BloggingDataKey::LatestPosts, &latest);

        // Author posts
        let mut author_posts: Vec<u64> = env.storage().persistent().get(&BloggingDataKey::AuthorPosts(author.clone())).unwrap_or_else(|| Vec::new(env));
        author_posts.push_front(id);
        env.storage().persistent().set(&BloggingDataKey::AuthorPosts(author), &author_posts);

        // Emit event
        env.events().publish(
            (Symbol::new(env, "post_created"), id, post.author.clone()),
            post.title.clone(),
        );

        id
    }

    pub fn get_post(env: &Env, id: u64) -> Option<BlogPost> {
        // Record a view
        if let Some(mut metrics) = env.storage().persistent().get::<_, PostMetrics>(&BloggingDataKey::PostMetrics(id)) {
            metrics.views += 1;
            env.storage().persistent().set(&BloggingDataKey::PostMetrics(id), &metrics);
        }
        env.storage().persistent().get(&BloggingDataKey::Post(id))
    }

    pub fn add_comment(env: &Env, post_id: u64, author: Address, content: String) {
        author.require_auth();
        
        let comment = Comment {
            author,
            content,
            timestamp: env.ledger().timestamp(),
        };

        let mut comments: Vec<Comment> = env.storage().persistent().get(&BloggingDataKey::PostComments(post_id)).unwrap_or_else(|| Vec::new(env));
        comments.push_back(comment);
        env.storage().persistent().set(&BloggingDataKey::PostComments(post_id), &comments);

        // Update metrics
        if let Some(mut metrics) = env.storage().persistent().get::<_, PostMetrics>(&BloggingDataKey::PostMetrics(post_id)) {
            metrics.comments += 1;
            env.storage().persistent().set(&BloggingDataKey::PostMetrics(post_id), &metrics);
        }

        env.events().publish(
            (Symbol::new(env, "comment_added"), post_id),
            env.ledger().timestamp(),
        );
    }

    pub fn react_to_post(env: &Env, post_id: u64, reader: Address, reaction: ReactionType) {
        reader.require_auth();

        let mut reactions: Vec<(Address, ReactionType)> = env.storage().persistent().get(&BloggingDataKey::PostReactions(post_id)).unwrap_or_else(|| Vec::new(env));
        let mut metrics = Self::get_post_metrics(env, post_id);
        
        // Remove old reaction if exists and update type counts
        let mut found = false;
        for i in 0..reactions.len() {
            if let Some((addr, old_reaction)) = reactions.get(i) {
                if addr == reader {
                    // Decrement old type count
                    Self::update_reaction_count(&mut metrics, old_reaction, false);
                    // Increment new type count
                    Self::update_reaction_count(&mut metrics, reaction, true);
                    
                    reactions.set(i, (reader.clone(), reaction));
                    found = true;
                    break;
                }
            }
        }

        if !found {
            reactions.push_back((reader.clone(), reaction));
            metrics.reactions += 1;
            Self::update_reaction_count(&mut metrics, reaction, true);
        }

        env.storage().persistent().set(&BloggingDataKey::PostReactions(post_id), &reactions);
        env.storage().persistent().set(&BloggingDataKey::PostMetrics(post_id), &metrics);
    }

    fn update_reaction_count(metrics: &mut PostMetrics, reaction: ReactionType, increment: bool) {
        let val = if increment { 1 } else { -1i64 };
        match reaction {
            ReactionType::Like => metrics.like_count = (metrics.like_count as i64 + val) as u64,
            ReactionType::Love => metrics.love_count = (metrics.love_count as i64 + val) as u64,
            ReactionType::Insightful => metrics.insightful_count = (metrics.insightful_count as i64 + val) as u64,
            ReactionType::Funny => metrics.funny_count = (metrics.funny_count as i64 + val) as u64,
        }
    }

    pub fn get_posts_range(env: &Env, start_id: u64, count: u64) -> Vec<BlogPost> {
        let mut posts = Vec::new(env);
        let next_id: u64 = env.storage().instance().get(&BloggingDataKey::NextPostId).unwrap_or(0);
        
        let end = if start_id + count > next_id { next_id } else { start_id + count };
        
        for id in start_id..end {
            if let Some(post) = env.storage().persistent().get::<_, BlogPost>(&BloggingDataKey::Post(id)) {
                posts.push_back(post);
            }
        }
        posts
    }

    pub fn get_latest_posts(env: &Env) -> Vec<BlogPost> {
        let ids: Vec<u64> = env.storage().persistent().get(&BloggingDataKey::LatestPosts).unwrap_or_else(|| Vec::new(env));
        let mut posts = Vec::new(env);
        for id in ids.iter() {
            if let Some(post) = env.storage().persistent().get::<_, BlogPost>(&BloggingDataKey::Post(id)) {
                posts.push_back(post);
            }
        }
        posts
    }

    pub fn get_post_metrics(env: &Env, post_id: u64) -> PostMetrics {
        env.storage().persistent().get(&BloggingDataKey::PostMetrics(post_id)).unwrap_or(PostMetrics { views: 0, reactions: 0, comments: 0 })
    }

    pub fn get_comments(env: &Env, post_id: u64) -> Vec<Comment> {
        env.storage().persistent().get(&BloggingDataKey::PostComments(post_id)).unwrap_or_else(|| Vec::new(env))
    }
}
