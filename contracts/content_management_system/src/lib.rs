#![no_std]

mod errors;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use errors::Error;
use events::*;
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};
use storage::*;
use types::{AccessPolicy, ContentItem, ContentMetadata, ContentStatus};

#[contract]
pub struct ContentManagementSystem;

#[contractimpl]
impl ContentManagementSystem {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }

        set_admin(&env, &admin);
        emit_admin_set(&env, &admin);

        Ok(())
    }

    /// Register a new instructor (admin only)
    pub fn add_instructor(env: Env, instructor: Address) -> Result<(), Error> {
        let admin = get_admin(&env)?;
        admin.require_auth();

        if is_instructor(&env, &instructor) {
            return Err(Error::AlreadyInstructor);
        }

        set_instructor(&env, &instructor, true);
        emit_instructor_registry_changed(&env, &instructor, true);

        Ok(())
    }

    /// Revoke instructor privileges (admin only)
    pub fn remove_instructor(env: Env, instructor: Address) -> Result<(), Error> {
        let admin = get_admin(&env)?;
        admin.require_auth();

        if !is_instructor(&env, &instructor) {
            return Err(Error::NotInstructor);
        }

        set_instructor(&env, &instructor, false);
        emit_instructor_registry_changed(&env, &instructor, false);

        Ok(())
    }

    /// Create a new content item (instructor only)
    pub fn create_content(
        env: Env,
        instructor: Address,
        title: String,
        description: String,
        content_hash: String,
        content_type: String,
        tags: Vec<String>,
        access_policy: AccessPolicy,
    ) -> Result<u64, Error> {
        instructor.require_auth();

        if !is_instructor(&env, &instructor) {
            return Err(Error::NotInstructor);
        }

        // Validate metadata
        if title.len() > 200 {
            return Err(Error::TitleTooLong);
        }
        if description.len() > 1000 {
            return Err(Error::DescriptionTooLong);
        }
        if content_hash.len() == 0 {
            return Err(Error::InvalidContentHash);
        }

        let content_id = get_next_content_id(&env);

        let metadata = ContentMetadata {
            title,
            description,
            content_type,
            tags,
        };

        let content_item = ContentItem {
            content_id,
            instructor: instructor.clone(),
            metadata,
            content_hash: content_hash.clone(),
            version: 1,
            status: ContentStatus::Draft,
            access_policy,
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
        };

        save_content(&env, content_id, &content_item);
        save_content_version(&env, content_id, 1, &content_hash);
        increment_content_id(&env);

        emit_content_created(&env, content_id, &instructor);

        Ok(content_id)
    }

    /// Update existing content (creates new version)
    pub fn update_content(
        env: Env,
        content_id: u64,
        title: String,
        description: String,
        content_hash: String,
        content_type: String,
        tags: Vec<String>,
    ) -> Result<u32, Error> {
        let mut content = get_content(&env, content_id)?;

        content.instructor.require_auth();

        if content.status == ContentStatus::Archived {
            return Err(Error::ContentArchived);
        }

        // Validate metadata
        if title.len() > 200 {
            return Err(Error::TitleTooLong);
        }
        if description.len() > 1000 {
            return Err(Error::DescriptionTooLong);
        }
        if content_hash.len() == 0 {
            return Err(Error::InvalidContentHash);
        }

        let new_version = content.version + 1;

        content.metadata.title = title;
        content.metadata.description = description;
        content.metadata.content_type = content_type;
        content.metadata.tags = tags;
        content.content_hash = content_hash.clone();
        content.version = new_version;
        content.updated_at = env.ledger().timestamp();

        save_content(&env, content_id, &content);
        save_content_version(&env, content_id, new_version, &content_hash);

        emit_content_updated(&env, content_id, new_version);

        Ok(new_version)
    }

    /// Publish a draft content item
    pub fn publish_content(env: Env, content_id: u64) -> Result<(), Error> {
        let mut content = get_content(&env, content_id)?;

        content.instructor.require_auth();

        if content.status != ContentStatus::Draft {
            return Err(Error::InvalidStatusTransition);
        }

        let old_status = content.status.clone();
        content.status = ContentStatus::Published;
        content.updated_at = env.ledger().timestamp();

        save_content(&env, content_id, &content);

        emit_content_status_changed(&env, content_id, &old_status, &ContentStatus::Published);

        Ok(())
    }

    /// Archive a content item (admin or instructor only)
    pub fn archive_content(env: Env, caller: Address, content_id: u64) -> Result<(), Error> {
        caller.require_auth();

        let mut content = get_content(&env, content_id)?;

        let admin = get_admin(&env)?;
        let is_admin = caller == admin;
        let is_owner = caller == content.instructor;

        if !is_admin && !is_owner {
            return Err(Error::Unauthorized);
        }

        if content.status == ContentStatus::Archived {
            return Err(Error::AlreadyArchived);
        }

        let old_status = content.status.clone();
        content.status = ContentStatus::Archived;
        content.updated_at = env.ledger().timestamp();

        save_content(&env, content_id, &content);

        emit_content_status_changed(&env, content_id, &old_status, &ContentStatus::Archived);

        Ok(())
    }

    /// Enroll a student in a content item
    pub fn enroll_student(env: Env, student: Address, content_id: u64) -> Result<(), Error> {
        student.require_auth();

        let content = get_content(&env, content_id)?;

        // Check if content allows enrollment
        if content.access_policy != AccessPolicy::Enrolled {
            return Err(Error::EnrollmentNotAllowed);
        }

        if content.status == ContentStatus::Archived {
            return Err(Error::ContentArchived);
        }

        if is_enrolled(&env, content_id, &student) {
            return Err(Error::AlreadyEnrolled);
        }

        set_enrollment(&env, content_id, &student, true);

        emit_enrollment_created(&env, &student, content_id);

        Ok(())
    }

    /// Revoke a student's enrollment (instructor only)
    pub fn revoke_enrollment(env: Env, content_id: u64, student: Address) -> Result<(), Error> {
        let content = get_content(&env, content_id)?;

        content.instructor.require_auth();

        if !is_enrolled(&env, content_id, &student) {
            return Err(Error::NotEnrolled);
        }

        set_enrollment(&env, content_id, &student, false);

        emit_enrollment_revoked(&env, &student, content_id);

        Ok(())
    }

    /// Get content item details (with access control)
    pub fn get_content(env: Env, content_id: u64, caller: Address) -> Result<ContentItem, Error> {
        let content = get_content(&env, content_id)?;

        // Check access permissions
        let is_admin = match get_admin(&env) {
            Ok(admin) => caller == admin,
            Err(_) => false,
        };
        let is_instructor = caller == content.instructor;

        // Draft content: only instructor and admin
        if content.status == ContentStatus::Draft {
            if !is_admin && !is_instructor {
                return Err(Error::AccessDenied);
            }
        }

        // Published content: check access policy
        if content.status == ContentStatus::Published {
            match content.access_policy {
                AccessPolicy::Public => {} // Anyone can access
                AccessPolicy::Enrolled => {
                    if !is_admin && !is_instructor && !is_enrolled(&env, content_id, &caller) {
                        return Err(Error::AccessDenied);
                    }
                }
                AccessPolicy::Restricted => {
                    if !is_admin && !is_instructor {
                        return Err(Error::AccessDenied);
                    }
                }
            }
        }

        // Archived content: same as published
        if content.status == ContentStatus::Archived {
            match content.access_policy {
                AccessPolicy::Public => {}
                AccessPolicy::Enrolled => {
                    if !is_admin && !is_instructor && !is_enrolled(&env, content_id, &caller) {
                        return Err(Error::AccessDenied);
                    }
                }
                AccessPolicy::Restricted => {
                    if !is_admin && !is_instructor {
                        return Err(Error::AccessDenied);
                    }
                }
            }
        }

        Ok(content)
    }

    /// Get a specific version of content
    pub fn get_content_version(
        env: Env,
        content_id: u64,
        version: u32,
        caller: Address,
    ) -> Result<String, Error> {
        // First check access to the content
        Self::get_content(env.clone(), content_id, caller)?;

        // Then get the version
        get_content_version(&env, content_id, version)
    }

    /// List all public published content
    pub fn list_public_content(env: Env) -> Vec<u64> {
        let total = get_next_content_id(&env);
        let mut result = Vec::new(&env);

        for i in 0..total {
            if let Ok(content) = get_content(&env, i) {
                if content.status == ContentStatus::Published
                    && content.access_policy == AccessPolicy::Public
                {
                    result.push_back(i);
                }
            }
        }

        result
    }

    /// List content by instructor
    pub fn list_content_by_instructor(env: Env, instructor: Address) -> Vec<u64> {
        let total = get_next_content_id(&env);
        let mut result = Vec::new(&env);

        for i in 0..total {
            if let Ok(content) = get_content(&env, i) {
                if content.instructor == instructor {
                    result.push_back(i);
                }
            }
        }

        result
    }

    /// List content enrolled by student
    pub fn list_enrolled_content(env: Env, student: Address) -> Vec<u64> {
        let total = get_next_content_id(&env);
        let mut result = Vec::new(&env);

        for i in 0..total {
            if is_enrolled(&env, i, &student) {
                result.push_back(i);
            }
        }

        result
    }

    /// Check if an address is an instructor
    pub fn is_instructor(env: Env, address: Address) -> bool {
        is_instructor(&env, &address)
    }

    /// Get admin address
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        get_admin(&env)
    }

    /// Check if student is enrolled
    pub fn is_enrolled(env: Env, content_id: u64, student: Address) -> bool {
        is_enrolled(&env, content_id, &student)
    }
}
