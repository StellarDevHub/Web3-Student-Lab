# Tokenomics buyback dashboard API contract

The production dashboard reads **only** this endpoint; it does not create transaction, supply, or aggregate values in the browser.

`GET /api/v1/tokenomics/buybacks`

The backend/indexer adapter must return JSON in this shape. Decimal blockchain values may be JSON numbers or decimal strings. Amounts must already be normalised to their display units by the adapter (for example, applying the asset decimals).

```json
{
  "records": [
    {
      "timestamp": "2026-07-30T12:00:00.000Z",
      "purchaseAmount": "50000.00",
      "tokensPurchased": "1000",
      "pricePerToken": "50.00",
      "transactionId": "stellar-transaction-hash",
      "explorerUrl": "https://stellar.expert/explorer/public/tx/stellar-transaction-hash"
    }
  ],
  "config": {
    "revenuePercentage": "15",
    "frequency": 86400,
    "minBuybackAmount": "10000",
    "maxBuybackAmount": "100000",
    "enabled": true
  },
  "treasuryBalance": "150000",
  "supply": {
    "initialSupply": "10000000",
    "history": [{ "timestamp": 1785412800, "supply": "9999000", "burned": "1000" }]
  }
}
```

## Adapter requirements

- Fetch execution records from the deployed `TokenBuyback` contract/indexer, including the actual transaction hash when available.
- Build `explorerUrl` in the backend from the configured network explorer; omit it if no verified explorer mapping exists.
- Return records and supply history in any order. The client validates and orders them chronologically.
- Do **not** return server-side totals for dashboard cards: totals are intentionally derived from `records`, the exact series displayed in history charts.
- Return `records: []` and `supply.history: []` for a correctly configured program with no executions. This is a successful response, not an error.
- Reject/transform malformed indexer data in the adapter. The client performs a second validation at the network boundary and presents an error state instead of displaying untraceable data.
