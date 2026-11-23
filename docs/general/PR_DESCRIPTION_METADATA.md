# [Contract] Token Metadata & URI Support

## Summary

Implemented comprehensive token metadata and URI support for RS-Tokens, following SEP-style patterns
and providing standardized format for frontend display.

## Implementation Details

### 📊 Core Metadata Structure

- **`TokenMetadata` struct** with name, symbol, decimals, and URI fields
- **SEP-compliant format** following Stellar ecosystem standards
- **Frontend-ready** structure for easy integration

### 🔍 Metadata Retrieval

- **`get_metadata()`** - Returns complete token metadata in standardized format
- **Default values** initialized during contract deployment
- **Error handling** with `MetadataNotFound` for missing metadata

### ⚙️ Admin URI Management

- **`update_uri(caller, new_uri)`** - Admin-only URI updates
- **Authorization** ensures only contract owner can modify metadata
- **Event emission** tracks all URI changes for transparency

### 🎯 Default Token Information

- **Name**: "RS-Token"
- **Symbol**: "RST"
- **Decimals**: 0 (non-divisible tokens)
- **URI**: "https://metadata.web3-student-lab.com/token/{id}"

## Technical Changes

### New Data Structures

```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub uri: String,
}
```

### Enhanced DataKey Enum

```rust
enum DataKey {
    // ... existing keys ...
    TokenMetadata,  // New key for metadata storage
}
```

### New Error Type

```rust
MetadataNotFound = 8,  // When metadata is not initialized
```

### Storage Integration

- **Metadata initialization** in `init()` function
- **Persistent storage** using instance storage
- **Efficient retrieval** with proper error handling

## Usage Examples

### Getting Token Metadata

```rust
// Retrieve complete token information
let metadata = contract.get_metadata();
// Returns: TokenMetadata { name: "RS-Token", symbol: "RST", decimals: 0, uri: "..." }
```

### Updating Token URI (Admin Only)

```rust
// Only contract owner can update URI
contract.update_uri(&owner_address, &"https://new-metadata.example.com/token/{id}");
```

## Frontend Integration

### 🌐 **Standardized Output Format**

The `get_metadata()` function returns a structure perfect for frontend consumption:

```javascript
// Example frontend integration
const metadata = await contract.get_metadata();
console.log(`Token: ${metadata.name} (${metadata.symbol})`);
console.log(`Decimals: ${metadata.decimals}`);
console.log(`Metadata URI: ${metadata.uri}`);
```

### 📱 **Display Ready**

- **Token names** for UI display
- **Symbols** for compact display (RST)
- **Decimals** for proper formatting
- **URI template** for off-chain metadata retrieval

## Event System

### 📢 **URI Update Events**

```rust
// Emitted when URI is updated
env.events().publish(
    ("uri_updated", "old_uri", "new_uri"),
    (old_uri, new_uri),
);
```

### 🔍 **Event Tracking**

- **Transparency**: All URI changes are logged
- **Audit trail**: Complete history of metadata updates
- **Frontend integration**: Real-time metadata change notifications

## Security Considerations

### 🔒 **Admin-Only Updates**

- **Owner verification** prevents unauthorized metadata changes
- **Authorization checks** ensure only privileged addresses can modify URI
- **Error handling** prevents unauthorized access

### 🛡️ **Data Validation**

- **Type safety** with Rust's type system
- **Error boundaries** prevent metadata corruption
- **Fallback values** ensure system stability

### 📋 **SEP Compliance**

- **Standard format** follows Stellar Enhancement Proposals
- **Interoperability** with existing wallet and exchange systems
- **Future-proof** design for ecosystem evolution

## Testing Coverage

### ✅ **Comprehensive Test Suite**

- Default metadata initialization verification
- Owner URI update functionality
- Unauthorized update rejection
- Frontend structure validation
- Event emission confirmation

### 🧪 **Test Results**

```bash
cargo test token
# 22 tests passed, 0 failed
```

### 📊 **Test Categories**

- **Initialization**: Metadata properly set during contract deployment
- **Authorization**: Only owners can update metadata
- **Functionality**: URI updates work correctly
- **Validation**: Structure meets frontend requirements

## Integration Benefits

### 🎓 **Educational Ecosystem**

- **Professional appearance** with proper token metadata
- **Exchange readiness** with standard token information
- **Student recognition** through branded tokens

### 🔄 **Backward Compatibility**

- **No breaking changes** to existing functionality
- **Optional features** that enhance without disrupting
- **Seamless upgrade** path for existing deployments

### 📈 **Scalability**

- **Efficient storage** with minimal gas overhead
- **Cachable metadata** for frontend performance
- **Flexible URI templates** for various metadata providers

## URI Template Support

### 🔗 **Dynamic Token IDs**

The default URI template supports dynamic token ID insertion:

```
https://metadata.web3-student-lab.com/token/{id}
```

### 📝 **Custom Metadata**

Admins can update to any URI template:

```
https://ipfs.io/ipfs/{hash}           // IPFS-based metadata
https://api.example.com/metadata/{id}   // Custom API
https://gateway.pinata.cloud/{cid}       // Pinata gateway
```

## Level: Intermediate ✅

This implementation provides a complete, SEP-compliant metadata system that enhances the RS-Token
contract with professional-grade token information management suitable for production educational
platforms.

## Next Steps

1. **PR Review**: Visit https://github.com/success-OG/Web3-Student-Lab/pull/new/feat/meta-data
2. **Frontend Integration**: Update UI to display token metadata
3. **Metadata Hosting**: Set up off-chain JSON metadata server
4. **Documentation**: Update developer guides for metadata usage
