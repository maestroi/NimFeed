# NimFeed Wallet Operations Guide

Date: 2026-05-05
Scope: Phase 1 MVP (`USER_REG`, `USERNAME_CLAIM`, `PROFILE_SET`, `POST_START`, `POST_CHUNK`, `POST_ANNOUNCE`)

## 1. Wallets Required

### A. Catalog Address Wallet (Required)
- Purpose: Owns the fixed `CATALOG_ADDRESS` that receives `USER_REG`, `USERNAME_CLAIM`, and `POST_ANNOUNCE`.
- Chain behavior: Receives only; should not be used for normal spending.
- Count: 1 per environment.
- Environments:
  - Testnet catalog wallet
  - Mainnet catalog wallet

### B. User Wallets (Required)
- Purpose: End-user identity and data namespace.
- Chain behavior:
  - Sends to catalog: `USER_REG`, `USERNAME_CLAIM`, `POST_ANNOUNCE`
  - Sends self-tx: `PROFILE_SET`, `POST_START`, `POST_CHUNK` (and later follow/like events)
- Count: 1 per user.

### C. Bootstrap/Operator Wallet (Recommended)
- Purpose: Admin/bootstrap actions (initial setup, controlled test transactions, operational checks).
- Chain behavior: Limited operational writes only; not the catalog wallet.
- Count: 1 per environment, low-balance.

### D. Treasury/Funding Wallet (Recommended)
- Purpose: Funds operator wallet(s), and optional onboarding faucet workflows if you add them later.
- Chain behavior: Rare transfers only.
- Count: 1 per environment.

## 2. Minimum Production Wallet Set

For mainnet, minimum recommended set is:
1. `catalog-mainnet` (dedicated address; no routine spending)
2. `operator-mainnet` (hot, low-balance)
3. `treasury-mainnet` (cold storage)

For testnet, mirror the same structure:
1. `catalog-testnet`
2. `operator-testnet`
3. `treasury-testnet`

## 3. What Should Sign What

- End users sign all personal actions via Hub.
- Operator wallet signs only admin/bootstrap flows.
- Catalog wallet should not be used as day-to-day signer.

Transaction ownership in Phase 1:
- `USER_REG`, `USERNAME_CLAIM`, `POST_ANNOUNCE`: signed by the user wallet (recipient is catalog address).
- `PROFILE_SET`, `POST_START`, `POST_CHUNK`: signed by the same user wallet as self-transactions.

## 4. RPC and Network Strategy

- Frontend/user path: public RPC is acceptable for read + normal user writes.
- Admin/bootstrap path: use your own trusted node RPC endpoint when possible.
- Keep hard separation between testnet and mainnet configs.
- Never allow “auto-fallback” from mainnet admin tooling to testnet (or vice versa).

## 5. Secret Management Rules

- Never store seed phrases or wallet passwords in source code.
- Never commit secrets into `.env` files.
- Store encrypted keystores only.
- Store decrypt credentials in a secret manager or hardware-backed mechanism.
- Prefer manual unlock/approval for high-impact operations.

## 6. Bootstrap App/CLI Recommendation

Use a separate internal tool (`admin-bootstrap`) instead of the public frontend.

Suggested capabilities:
- Create/generate catalog wallet per environment.
- Persist catalog address into config with explicit confirmation.
- Run setup checks:
  - RPC reachability
  - chain ID/network verification
  - balance checks
- Execute controlled bootstrap transactions with dry-run preview.
- Write append-only audit logs (`who`, `when`, `network`, `tx_hash`, `action`).

## 7. Operational Controls

- Require explicit environment flag (`--network testnet|mainnet`).
- Add dry-run mode for every admin command.
- Add two-step confirmations for mainnet writes.
- Use least-privilege balances on hot wallets.
- Rotate operator wallets periodically; keep treasury cold.

## 8. Rotation and Incident Response

### If operator wallet is compromised
1. Stop admin writes immediately.
2. Move remaining funds to treasury.
3. Create a new operator wallet.
4. Update bootstrap tool config.
5. Record incident and tx hashes in audit log.

### If catalog wallet key is exposed
- If the address is used as receive-only, immediate chain migration is not always required.
- Still rotate to a new catalog address for long-term safety, and ship a client config update/migration plan.
- Keep old catalog readable until all clients migrate.

## 9. Phase 1-Specific Notes

- `CATALOG_ADDRESS` in `src/protocol/constants.js` is currently testnet-oriented.
- Before mainnet launch:
  - Set `MAINNET_CATALOG_ADDRESS`.
  - Verify bootstrap tool + app configs point to the intended network.
  - Run a signed checklist and archive results.

## 10. Launch Checklist (Wallet-Focused)

1. Catalog wallets created for both networks.
2. Operator and treasury wallets created for both networks.
3. Secrets stored outside repo; recovery process tested.
4. Admin/bootstrap tool tested against testnet.
5. Mainnet config reviewed by two people.
6. Final catalog addresses documented and pinned in release notes.
