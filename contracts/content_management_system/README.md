# Content Management System Smart Contract

A Soroban smart contract for managing educational content in the Web3 Student Lab platform. This contract provides decentralized content management with access control, versioning, and enrollment features.

## Features

### Core Functionality

- **Content Creation & Management**: Instructors can create, update, and manage educational content
- **Access Control**: Three-tier access system (Public, Enrolled, Restricted)
- **Content Versioning**: Track and retrieve historical versions of content
- **Publication Lifecycle**: Draft → Published → Archived workflow
- **Enrollment System**: Students can enroll in content to gain access
- **Administrative Controls**: Admin can manage instructors and override access controls

### Storage Strategy

- **Instance Storage**: Admin address and content ID counter
- **Persistent Storage**: Content items, versions, instructors, and enrollments
- **TTL Management**: Automatic extension for all storage types

## Contract Architecture

### Data Types

#### AccessPolicy
```rust
pub enum AccessPolicy {
    Public,      // Anyone can access
    Enrolled,    // Only enrolled students
    Restricted,  // Only instructor and admin
}
```

#### ContentStatus
```rust
pub enum ContentStatus {
    Draft,      // Not yet published
    Published,  // Live and accessible
    Archived,   // Read-only, no new enrollments
}
```

#### ContentMetadata
- Title (max 200 characters)
- Description (max 1000 characters)
- Content type (lesson, module, course, resource)
- Tags (array of strings)

#### ContentItem
Complete content item with metadata, hash, version, status, and timestamps.

## API Reference

### Initialization

#### `initialize(admin: Address)`
Initialize the contract with an admin address. Can only be called once.

### Admin Functions

#### `add_instructor(instructor: Address)`
Register a new instructor. Requires admin authentication.

#### `remove_instructor(instructor: Address)`
Revoke instructor privileges. Requires admin authentication.

#### `archive_content(caller: Address, content_id: u64)`
Archive content. Requires admin or content owner authentication.

### Instructor Functions

#### `create_content(...) -> u64`
Create new content with metadata and access policy. Returns content ID.

**Parameters:**
- `instructor`: Instructor address (authenticated)
- `title`: Content title (max 200 chars)
- `description`: Content description (max 1000 chars)
- `content_hash`: IPFS or storage hash
- `content_type`: Type of content
- `tags`: Array of tags
- `access_policy`: Access control policy

#### `update_content(content_id: u64, ...) -> u32`
Update existing content, creating a new version. Returns new version number.

#### `publish_content(content_id: u64)`
Publish draft content, making it visible per access policy.

#### `revoke_enrollment(content_id: u64, student: Address)`
Remove a student's enrollment.

### Student Functions

#### `enroll_student(student: Address, content_id: u64)`
Enroll in content with Enrolled access policy.

### Query Functions

#### `get_content(content_id: u64, caller: Address) -> ContentItem`
Retrieve content with access control checks.

#### `get_content_version(content_id: u64, version: u32, caller: Address) -> String`
Get specific version's content hash.

#### `list_public_content() -> Vec<u64>`
List all public published content.

#### `list_content_by_instructor(instructor: Address) -> Vec<u64>`
List all content by an instructor.

#### `list_enrolled_content(student: Address) -> Vec<u64>`
List content student is enrolled in.

#### `is_instructor(address: Address) -> bool`
Check if address is an instructor.

#### `is_enrolled(content_id: u64, student: Address) -> bool`
Check if student is enrolled in content.

#### `get_admin() -> Address`
Get the admin address.

## Events

The contract emits the following events:

- `admin_set`: When admin is initialized
- `inst_reg`: When instructor is added/removed
- `content` + `created`: When content is created
- `content` + `updated`: When content is updated
- `status`: When content status changes
- `enroll` + `created`: When enrollment is created
- `enroll` + `revoked`: When enrollment is revoked

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 1 | AlreadyInitialized | Contract already initialized |
| 2 | NotInitialized | Contract not yet initialized |
| 3 | Unauthorized | Caller not authorized |
| 4 | NotInstructor | Caller is not an instructor |
| 5 | AlreadyInstructor | Address already an instructor |
| 6 | ContentNotFound | Content ID does not exist |
| 7 | VersionNotFound | Version does not exist |
| 8 | TitleTooLong | Title exceeds 200 characters |
| 9 | DescriptionTooLong | Description exceeds 1000 characters |
| 10 | InvalidContentHash | Content hash is empty |
| 11 | InvalidStatusTransition | Invalid status change |
| 12 | ContentArchived | Content is archived |
| 13 | AlreadyArchived | Content already archived |
| 14 | AccessDenied | Caller lacks access permission |
| 15 | EnrollmentNotAllowed | Content not enrollable |
| 16 | AlreadyEnrolled | Student already enrolled |
| 17 | NotEnrolled | Student not enrolled |

## Building & Testing

### Build
```bash
cargo build --target wasm32-unknown-unknown --release
```

### Test
```bash
cargo test
```

### Deploy (Testnet)
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/content_management_system.wasm \
  --source YOUR_ACCOUNT \
  --network testnet
```

## Usage Example

```rust
// Initialize contract
client.initialize(&admin);

// Add instructor
client.add_instructor(&instructor);

// Create content
let content_id = client.create_content(
    &instructor,
    &title,
    &description,
    &content_hash,
    &content_type,
    &tags,
    &AccessPolicy::Enrolled,
);

// Publish content
client.publish_content(&content_id);

// Enroll student
client.enroll_student(&student, &content_id);

// Access content
let content = client.get_content(&content_id, &student);
```

## Security Considerations

- All privileged operations require authentication via `require_auth()`
- Access control enforced on all content retrieval
- Archived content is immutable (no delete function)
- Storage TTL automatically extended to prevent expiration
- Input validation on all user-provided data

## Integration

This contract integrates with:
- **User Dashboard Module**: Provides content management backend
- **IPFS/Storage**: Stores actual content off-chain (only hashes on-chain)
- **Frontend**: Via Stellar SDK and contract clients

## License

This contract is part of the Web3 Student Lab platform.
