# NimFeed Admin Bootstrap CLI

Date: 2026-05-05
File: `scripts/admin-bootstrap.mjs`

## Purpose

Create and manage NimFeed operational wallets outside the frontend app:
- `catalog`
- `bootstrap`
- `treasury`

## Commands

```bash
npm run admin:bootstrap -- wallet:create --role catalog --network mainnet
npm run admin:bootstrap -- wallet:create-all --network mainnet
npm run admin:bootstrap -- wallet:funding
npm run admin:bootstrap -- config:export-env --network mainnet
```

## Options

- `--out-dir <path>`: output directory (default `.nimfeed-admin`)
- `--passphrase <text>`: store encrypted mnemonic backup in wallet file
- `--app-env-file <path>`: target env file for export (default `.env.local`)
- `--store-mnemonic`: store mnemonic in wallet file (default true)
- `--no-store-mnemonic`: do not store mnemonic in wallet file
- `--print-mnemonic`: print mnemonic (default true)
- `--no-print-mnemonic`: suppress mnemonic output
- `--force`: overwrite existing wallet file
- `--network <network>`: with `config:export-env`, sets `VITE_NIMFEED_NETWORK`

## Output Files

Wallet files are written to:

```text
.nimfeed-admin/<network>/<role>.json
```

Each file contains:
- role
- network
- NQ address
- creation time
- mnemonic backup (plain text by default, or encrypted with `--passphrase`)

## Funding Guidance

For bootstrap operations:
- `catalog` wallet: usually receive-only in Phase 1 (no funding required for receive-only role)
- `bootstrap` wallet: must hold NIM to pay transaction value/fees for admin actions
- `treasury` wallet: optional cold reserve to top up bootstrap wallet
- end users: each user wallet funds their own registration/posting txs

## App Integration

Export generated catalog wallets into app env:

```bash
npm run admin:bootstrap -- config:export-env --network mainnet
```

This writes/updates:
- `VITE_NIMFEED_MAINNET_CATALOG_ADDRESS`
- `VITE_NIMFEED_TESTNET_CATALOG_ADDRESS` (if testnet wallet exists)
- `VITE_NIMFEED_MAINNET_BOOTSTRAP_ADDRESS`
- `VITE_NIMFEED_TESTNET_BOOTSTRAP_ADDRESS` (if testnet wallet exists)
- `VITE_NIMFEED_NETWORK` (when `--network` is provided)
- `VITE_NIMFEED_DATA_RECIPIENT_ADDRESS` (set to selected network bootstrap wallet)

The app resolves `CATALOG_ADDRESS` from these values in `src/protocol/constants.js`.

## Notes

- Default behavior stores mnemonic in wallet file. Use `--passphrase` to encrypt it at rest.
- Keep passphrases and backups outside the repo and in secure storage.
- Use separate wallets for mainnet and testnet.
