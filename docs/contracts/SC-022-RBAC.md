# SC-022: RBAC with timelocked admin handover

`access-control` is a helper library for Soroban contracts, not a standalone
contract. The owning contract initializes the library and must add role checks
to each privileged entrypoint.

```rust
use access_control::{self as ac, Role};

// In the owning contract's initialization:
ac::initialize(&env, &admin);

// At the beginning of a privileged endpoint:
ac::require_role!(&env, &caller, Role::Instructor);

// Admin-managed application roles:
ac::grant_role(&env, &caller, Role::Minter, &account);
ac::revoke_role(&env, &caller, Role::Minter, &account);
```

The supported application roles are `Admin`, `Instructor`, `Minter`, and
`Auditor`. `Operator` and `Guardian` remain available for existing integrations;
guardians retain the existing pause permission.

Admin ownership cannot be changed through `grant_role` or `revoke_role`.
Instead, the current admin calls `propose_admin` and the candidate must
authorize `claim_admin` after 48 hours. The current admin may cancel a pending
proposal, and proposing a replacement candidate starts a fresh 48-hour delay.
The pending proposal is queryable using `pending_admin`.

Role grant/revoke events identify the affected role, account, actor, and
whether the account was granted or revoked. Admin proposal, cancellation, and
handover events publish the relevant parties and unlock time.
