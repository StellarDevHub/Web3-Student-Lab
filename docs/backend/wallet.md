# Stellar Wallet Connection Flow

## Overview

This document outlines the logical steps for connecting to a Stellar wallet from the Web3 Student
Lab frontend, bridged through the backend. The recommended wallet is **Freighter** — the most widely
used Stellar browser extension wallet.

## Prerequisites

- User has the [Freighter](https://www.freighter.app/) browser extension installed.
- Frontend includes the `@stellar/freighter-api` package.

## Connection Flow

### Step 1 — Detect Wallet Availability

Check whether Freighter is installed in the user's browser:

```
import { isConnected } from '@stellar/freighter-api';

const connected = await isConnected();
// returns true if Freighter extension is detected
```

If not detected, prompt the user to install Freighter.

### Step 2 — Request Public Key

Ask Freighter for the user's active public key:

```
import { requestAccess } from '@stellar/freighter-api';

const publicKey = await requestAccess();
// e.g. "GDLEI..."
```

This triggers a Freighter popup asking the user to approve the connection.

### Step 3 — Verify Network

Ensure the wallet is on the expected network (testnet for development):

```
import { getNetwork } from '@stellar/freighter-api';

const network = await getNetwork();
// "TESTNET" | "PUBLIC" | "FUTURENET"
```

If the network doesn't match, prompt the user to switch in Freighter settings.

### Step 4 — Backend Session (Optional)

Send the public key to the backend to associate it with the authenticated user session:

```
POST /api/blockchain/connect
Body: { publicKey: "GDLEI..." }
```

The backend can store this mapping for later operations (e.g., issuing certificates to the wallet).

### Step 5 — Transaction Signing

When the backend builds a Stellar/Soroban transaction that requires the user's signature:

1. Backend builds the transaction XDR and sends it to the frontend.
2. Frontend passes the XDR to Freighter for signing:

```
import { signTransaction } from '@stellar/freighter-api';

const signedXDR = await signTransaction(xdr, { network: 'TESTNET' });
```

3. Frontend sends the signed XDR back to the backend for submission to the network.

## Error Handling

| Scenario                | Action                                     |
| ----------------------- | ------------------------------------------ |
| Freighter not installed | Show install prompt with link              |
| User rejects connection | Show friendly retry message                |
| Wrong network           | Prompt user to switch network in Freighter |
| Signing rejected        | Abort transaction, notify user             |

## Security Considerations

- **Never** transmit or store the user's secret key. Freighter handles all signing locally.
- Validate the public key format server-side before storing.
- Use HTTPS in production to prevent XDR interception.

## Next Steps

- Implement frontend `useWallet` hook wrapping the above flow.
- Create `POST /api/blockchain/connect` endpoint on the backend.
- Add wallet status indicator to the UI.
