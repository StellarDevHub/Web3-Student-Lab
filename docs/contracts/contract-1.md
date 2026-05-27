# 🎨 Contract - Implement Dynamic NFT Metadata with On-Chain Updates

**Labels**: `contract` `complex` `metadata` `nft-standard` `soroban`  
**Difficulty**: 🔴 Hard  
**ETA**: 2 days  

## Problem Statement
Current NFT certificates have static metadata that cannot be updated after minting. Students achieve new milestones, complete advanced courses, or earn additional credentials that should be reflected in their existing certificates. We need dynamic metadata that can be updated by authorized parties while maintaining certificate integrity and audit trail.

## Current State
- Static metadata at minting
- Cannot update certificate details
- No achievement tracking
- Metadata stored once, never changes

## Desired State
- Updatable metadata fields (student name, achievements, endorsements)
- Authorized updates only (admin + certificate owner)
- Version history for all changes
- Immutable core fields (owner, course, mint date)
- Update events for transparency

## Technical Requirements

### Metadata Structure
```rust
struct ImmutableMetadata {
    token_id: u128,
    course_id: BytesN<32>,
    student_address: Address,
    mint_date: u64,
}

struct MutableMetadata {
    student_name: String,
    achievements: Vec<String>,
    skill_endorsements: Vec<String>,
    version: u32,
    last_updated: u64,
}
```

### Update Interface
```rust
fn update_metadata(
    e: &Env,
    token_id: u128,
    updates: MutableMetadata,
    updater: &Address,
) -> Result<(), Error>;

fn get_metadata_history(
    e: &Env,
    token_id: u128,
) -> Vec<MetadataVersion>;
```

## Acceptance Criteria
- [ ] Update mutable metadata fields
- [ ] Prevent updates to immutable fields
- [ ] Version history for all updates
- [ ] Proper access control per field
- [ ] Update events emitted
- [ ] Gas-optimized updates (<100k gas)
- [ ] Comprehensive unit tests

## Implementation Steps
1. Design metadata schema (immutable vs mutable)
2. Implement update function with access control
3. Build version tracking system
4. Add query functions for history
5. Test all scenarios

## Files to Create
- `contracts/src/metadata.rs`
- `contracts/src/tests/metadata_test.rs`

## Resources
- [Soroban Storage Patterns](https://soroban.stellar.org/docs/advanced/storage)
- [Dynamic NFT Standards](https://github.com/ERC721/dynamic-nft)

## Success Metrics
- Update gas cost <100k
- 100% permission enforcement
- Version history accuracy
