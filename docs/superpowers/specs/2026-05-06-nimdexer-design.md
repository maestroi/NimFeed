# NimDexer — Design Spec
_Date: 2026-05-06_

## Overview

NimDexer is a standalone Vue 3 + TypeScript app that uses the Nimiq chain as the sole source of truth for a distributed artifact index. A trusted publisher posts compact 64-byte binary records to a catalog address. The browser client scans those records, decodes them locally, and reconstructs artifact metadata (download URLs, magnet links, file hashes) from enum registries and deterministic URL templates — no backend required.

---

## Goals

- 1 transaction per common artifact (Linux ISOs, snapshots, binaries, asset packs)
- No backend DB or API — chain + browser IndexedDB only
- Full-fidelity 32-byte hashes (no truncation for btih-v2 / SHA256)
- Simple, versioned binary protocol with a single generic announce schema
- Publisher uses Nimiq Hub — no private key exposure in the browser

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3, TypeScript, Pinia, Vue Router |
| Local cache | Dexie (IndexedDB) |
| Wallet / signing | @nimiq/hub-api |
| Chain scanning | Nimiq JSON-RPC (direct from browser) |
| Build | Vite + Tailwind CSS v4 |
| Testing | Vitest + happy-dom + fake-indexeddb |
| Deployment | Docker + nginx, static SPA |
| Key generation | @nimiq/core (scripts only) |

---

## Indexing Model

### Catalog-address pattern (same as NimFeed)

The publisher sends transactions **to** `NIMDEXER_CATALOG_ADDRESS` with 64-byte binary `extraData`. The indexer watches incoming transactions to that address and applies two filters before decoding:

1. `tx.sender == TRUSTED_PUBLISHER_ADDRESS`
2. `extraData[0-1] == [0x4e, 0x44]` (magic bytes "ND")
3. CRC32 over bytes `[0-57]` matches bytes `[58-61]`

Records that fail any filter are silently skipped (debug log only). Only valid, publisher-signed, CRC-verified records enter Dexie.

### Future expansion

The same catalog address can accept multiple trusted publishers by extending the publisher filter to a set. Alternatively, users can subscribe to additional catalog addresses. Neither change requires a protocol version bump.

---

## Binary Protocol — v1

### Magic and versioning

```
magic[0] = 0x4e  ('N')
magic[1] = 0x44  ('D')
version  = 0x01
```

The `version` byte allows future incompatible layouts without changing the magic. Unknown versions are skipped.

---

### Record type 0x01 — ArtifactAnnounce (64 bytes)

```
Offset  Size  Type      Field           Notes
─────────────────────────────────────────────────────────────────────
[0]      1    u8        magic[0]        0x4e
[1]      1    u8        magic[1]        0x44
[2]      1    u8        version         0x01
[3]      1    u8        record_type     0x01
[4]      1    u8        artifact_type   ArtifactType enum
[5]      1    u8        transport_type  TransportType enum
[6]      1    u8        hash_type       HashType enum
[7]      1    u8        flags           bitfield (see below)
[8-39]  32    bytes     content_hash    full 32 bytes; btih-v1: 20b + 12b zero pad
[40-47]  8    u64-be    size_bytes      file size in bytes
[48-49]  2    u16-be    version_code    (major*100+minor); epoch for snapshots
[50-51]  2    u16-be    registry_id_1   distro / project registry ID
[52-53]  2    u16-be    registry_id_2   arch / flavor / network registry ID
[54-57]  4    u32-be    publisher_seq   monotonic per publisher; links MetadataChunks
[58-61]  4    u32-be    crc32           CRC-32 over bytes [0-57]
[62-63]  2    u16-be    template_id     tracker_set_id (torrent/magnet);
                                         url_template_id (http/s3/github); 0 = default
```

**Flags byte [7]:**

| Bit | Name | Meaning |
|---|---|---|
| 0 | has_metadata_chunks | one or more MetadataChunk txs linked by publisher_seq |
| 1 | deprecated | artifact superseded; check deprecations table |
| 2 | publisher_verified | explicit publisher attestation |
| 3 | requires_license | consumer must acknowledge license before use |
| 4-7 | reserved | must be 0 |

---

### Record type 0x02 — MetadataChunk (64 bytes)

Used only when the generic announce record cannot express the artifact cleanly (custom names, non-template download URLs, long descriptions, exact block heights > 65535, extended checksums). The announce record sets `flags.has_metadata_chunks = 1`.

**Publish order: MetadataChunks first, ArtifactAnnounce last.** Orphaned chunks without a parent announce are harmless. The artifact becomes visible only when the announce tx is confirmed, at which point all chunks are already present.

```
Offset  Size  Type      Field           Notes
─────────────────────────────────────────────────────────────────────
[0]      1    u8        magic[0]        0x4e
[1]      1    u8        magic[1]        0x44
[2]      1    u8        version         0x01
[3]      1    u8        record_type     0x02
[4-7]    4    u32-be    parent_seq      publisher_seq of parent ArtifactAnnounce
[8]      1    u8        chunk_index     0-based
[9]      1    u8        total_chunks    total chunks for this field_id
[10]     1    u8        field_id        MetadataField enum
[11]     1    u8        data_length     bytes used in [12-63] (max 52)
[12-63] 52    bytes     data            field payload (UTF-8 or binary)
```

`publisher_address` is **not stored in the binary payload** — it is always taken from `tx.sender` by the indexer and stored alongside the decoded chunk in Dexie. This is how the Dexie compound key `[publisher_address+parent_seq+field_id+chunk_index]` is populated.

**MetadataField enum:**

| Value | Name | Format |
|---|---|---|
| 0x01 | custom_name | UTF-8 string |
| 0x02 | download_url | UTF-8 string |
| 0x03 | description | UTF-8 string |
| 0x04 | exact_block_height | u64-be (8 bytes) |
| 0x05 | tracker_list | pipe-delimited UTF-8 tracker URLs |
| 0x06 | checksum_sha512 | 64 bytes (2 chunks) |
| 0x07 | license_id | u16-be SPDX registry ID |

---

### Record type 0x03 — ArtifactDeprecate (64 bytes)

```
Offset  Size  Type      Field
─────────────────────────────────────────────────────────────────────
[0-3]    4    header    magic[0-1], version, record_type=0x03
[4-7]    4    u32-be    target_seq       publisher_seq of artifact to deprecate
[8-9]    2    u16-be    reason_code      0x01 superseded / 0x02 incorrect /
                                          0x03 withdrawn / 0x04 security
[10-41] 32    bytes     replacement_hash 32 bytes; zeros if no replacement
[42-45]  4    u32-be    publisher_seq    this deprecation's own seq
[46-49]  4    u32-be    crc32            over bytes [0-45]
[50-63] 14    bytes     spare            0x00
```

---

### Enum Tables (src/protocol/enums.ts)

**ArtifactType**
```
0x00 unknown           0x01 linux_iso
0x02 blockchain_snapshot  0x03 node_binary
0x04 config_bundle     0x05 game_asset_pack
0x06 public_dataset    0x07 generic_http
0x08 wasm_binary
```

**TransportType**
```
0x00 unknown    0x01 http        0x02 s3_r2
0x03 github_release  0x04 ipfs  0x05 torrent_v1
0x06 torrent_v2      0x07 magnet
```

**HashType**
```
0x00 none                  0x01 btih_v1        (SHA1, 20b + 12b pad)
0x02 btih_v2               (SHA256, 32b)
0x03 sha256                (32b)
0x04 sha512_trunc32        (first 32b of SHA-512)
0x05 ipfs_cid_v1_sha256    (32b SHA256 digest from CIDv1)
0x06 md5_padded            (16b + 16b pad; not recommended)
```

**registry_id_1 — Distro / Project**
```
0x0000 unknown
0x0001 ubuntu    0x0002 debian    0x0003 fedora
0x0004 arch      0x0005 alpine    0x0006 nixos
0x0100 solana    0x0101 ethereum  0x0102 nimiq
0x0103 bitcoin   0x0104 polygon
0x0200 steam     0x0201 godot
```

**registry_id_2 — Arch / Flavor / Network**
```
0x0000 unknown
0x0001 x86_64   0x0002 arm64    0x0003 armv7
0x0100 desktop  0x0101 server   0x0102 minimal  0x0103 live
0x0200 mainnet  0x0201 testnet  0x0202 devnet
```

Unknown registry IDs decode without error and render as "Unknown / unsupported" in the UI.

---

### Tx-count examples

| Artifact | Txs | Reason |
|---|---|---|
| Ubuntu 26.04 ISO torrent (btih-v1) | **1** | distro+arch in registry; btih_v1 fits 20b |
| Ubuntu 26.04 ISO torrent (btih-v2) | **1** | btih_v2 = full 32b hash |
| Solana snapshot on R2 (SHA256) | **1** | hash + size + epoch in announce |
| Nimiq node binary on GitHub (SHA256) | **1** | project + arch + version in registry |
| Custom named dataset (no template URL) | **2** | announce + 1 MetadataChunk (download_url) |
| Godot game pack with description | **2-3** | announce + 1-2 MetadataChunks |
| IPFS artifact | **1** | 32b SHA256 digest from CIDv1 |

---

## Indexer Architecture

### NimDexerIndexerService (src/services/NimDexerIndexerService.ts)

Mirrors NimFeed's `IndexerService`. Runs entirely in the browser.

```
syncCatalog()
  └── _syncScoped('catalog:<CATALOG_ADDRESS>', catalogAddress, handleRecord)
        ├── fetch newest page from RPC
        ├── compare against newest_seen_tx_hash → process new txs
        ├── update sync_state
        └── _backfill() if not fully_synced (cursor-paginated, 10s wall-clock budget)

handleRecord(tx)
  ├── filter: tx.sender == TRUSTED_PUBLISHER_ADDRESS
  ├── filter: extraData[0-1] == [0x4e, 0x44]
  ├── decode → validateCrc32 → skip if invalid
  └── dispatch by record_type:
        0x01 → handleAnnounce
        0x02 → handleMetadataChunk
        0x03 → handleDeprecate
        else → skip

handleAnnounce(tx, record)
  → upsert artifacts row (publisher_address + publisher_seq as PK)
  → store block_height, tx_hash, all decoded fields
  → check if MetadataChunks already present; assemble if complete

handleMetadataChunk(tx, record)
  → upsert metadata_chunks row ([publisher_address+parent_seq+field_id+chunk_index])
  → check if all total_chunks present for this field_id
  → if complete: assemble field, write back to parent artifacts row

handleDeprecate(tx, record)
  → upsert deprecations row
  → mark target artifacts row deprecated = true

startDeltaSyncLoop(60_000)
  → setInterval + visibilitychange resume
```

### artifactResolver.ts (src/services/artifactResolver.ts)

Pure function, no side effects:

```typescript
resolveDownloadUrl(artifact: ArtifactRow): string | null

// torrent_v1/v2  → magnet:?xt=urn:btih:<hex>&dn=<name>&tr=<trackers from TRACKER_SETS[template_id]>
// s3_r2          → ARTIFACT_BASE_URL/{type}/{network}/{version}/{hash_hex}.{ext}
// github_release → https://github.com/{owner}/{repo}/releases/download/v{version}/{filename}
// ipfs           → https://ipfs.io/ipfs/b<base32-cid>  (reconstructed from 32b digest)
// http           → artifact.download_url (from MetadataChunk) or registry URL template
// unknown        → null
```

Name and filename derived from `registry_id_1` + `registry_id_2` + `version_code` via registry lookup in `enums.ts`.

---

## Local Database (src/db/dexie.ts)

```typescript
db.version(1).stores({
  artifacts:
    '[publisher_address+publisher_seq], ' +
    'publisher_address, publisher_seq, artifact_type, transport_type, ' +
    'block_height, [artifact_type+transport_type], [artifact_type+registry_id_1]',

  metadata_chunks:
    '[publisher_address+parent_seq+field_id+chunk_index], ' +
    '[publisher_address+parent_seq], ' +
    '[publisher_address+parent_seq+field_id]',

  deprecations:
    '[target_publisher+target_seq], [publisher_address+publisher_seq]',

  sync_state:
    'scope_key',
})
```

**artifacts row:**
```typescript
{
  publisher_address:    string
  publisher_seq:        number        // compound PK with publisher_address
  block_height:         number
  tx_hash:              string
  artifact_type:        number
  transport_type:       number
  hash_type:            number
  flags:                number
  content_hash:         Uint8Array    // 32 bytes
  size_bytes:           string        // stringified uint64 (avoids BigInt serialisation issues)
  version_code:         number
  registry_id_1:        number
  registry_id_2:        number
  template_id:          number
  crc32_valid:          boolean
  deprecated:           boolean
  // assembled from MetadataChunks after all chunks received:
  custom_name:          string | null
  download_url:         string | null
  description:          string | null
  exact_block_height:   string | null // stringified uint64
}
```

**sync_state row:**
```typescript
{
  scope_key:                string
  newest_seen_tx_hash:      string | null
  oldest_synced_cursor:     string | null
  newest_seen_block_height: number | null
  oldest_seen_block_height: number | null
  fully_synced:             boolean
  last_synced_at:           number
}
```

---

## Vue App Structure

### Routes
```
/                              ArtifactIndexView    browse + filter
/artifact/:publisher/:seq      ArtifactDetailView   detail, download, verify
/publish                       PublishArtifactView  admin (locked to publisher wallet)
```

### Pinia Stores

**artifactStore.ts**
```
state:  artifacts[], filters, syncStatus, lastSyncedAt
actions: initSync(), syncNow(), setFilters()
source:  Dexie liveQuery — reactive, no manual polling
```

**publisherStore.ts**
```
state:  walletAddress, isPublisher (computed), pendingTxs[]
actions:
  connect()           — Hub choose-address
  disconnect()
  resolveNextSeq()    — sync catalog → find max publisher_seq → return max+1
                        throws if sync is stale (>5 min old)
  publishArtifact()   — encode + send MetadataChunks first, then Announce last
                        one Hub popup per tx, sequential
```

### Component Tree
```
App.vue
└── AppShell.vue
    ├── NavBar.vue               logo · sync status dot · wallet button
    ├── ArtifactIndexView.vue
    │   ├── ArtifactFilters.vue  type / transport / distro / arch dropdowns
    │   ├── SyncStatusBar.vue    "Synced to block 4,123,456 · 12 artifacts"
    │   └── ArtifactCard.vue × N
    │       ├── VerificationBadge.vue
    │       └── DownloadButton.vue
    ├── ArtifactDetailView.vue
    │   ├── VerificationBadge.vue
    │   ├── DownloadButton.vue
    │   ├── HashDisplay.vue       hex hash + copy
    │   └── MetadataPanel.vue     assembled metadata fields
    └── PublishArtifactView.vue
        ├── [non-publisher]  "Connect publisher wallet" prompt
        └── [publisher only]
            ├── PublishForm.vue
            │   ├── field pickers (type, transport, hash_type)
            │   ├── RegistryPicker.vue (distro/project + arch/flavor)
            │   ├── HashInput.vue      hex input + validation
            │   └── TxPreview.vue      live hex dump · decoded fields ·
            │                          resolved URL/magnet · tx count · warnings
            └── TxProgress.vue         "Signing tx 2 of 3 (MetadataChunk 0x01)…"
```

### VerificationBadge states
- **Trusted publisher** — sender matches TRUSTED_PUBLISHER_ADDRESS
- **Hash present** — content_hash is non-zero
- **Deterministic source** — URL derived from registry (no MetadataChunk needed)
- **Deprecated** — flags.deprecated or deprecations table entry exists
- **Metadata complete** — all expected MetadataChunks assembled

---

## Publishing Flow

```
1. Connect wallet via Hub (publisherStore.connect)
   → /publish shows form only if walletAddress == TRUSTED_PUBLISHER_ADDRESS

2. Fill PublishForm
   → artifact_type, transport_type, hash_type, hash hex,
     size, version_code, registry_id_1, registry_id_2, template_id

3. publisherStore.resolveNextSeq()
   → triggers syncNow() first
   → scans artifacts for max publisher_seq where publisher_address == walletAddress
   → next_seq = max + 1
   → throws "Sync too stale, please wait" if lastSyncedAt > 5 minutes ago

4. encoder.buildArtifactAnnounce(fields, nextSeq) → Uint8Array[64]
   If custom fields needed:
   encoder.buildMetadataChunks(fields, nextSeq) → Uint8Array[64][]

5. TxPreview renders:
   - annotated hex dump (field per row)
   - artifact type label + transport label
   - resolved download URL or magnet preview
   - "N transaction(s) required"
   - warning if MetadataChunks are unnecessary (artifact expressible in 1 tx)

6. "Publish" button:
   For each MetadataChunk tx (chunks first):
     hub.signAndSend({ extraData: chunkBytes })
     TxProgress: "Signing tx N of M (MetadataChunk field_id=0x01)"
   Then ArtifactAnnounce tx last:
     hub.signAndSend({ extraData: announceBytes })

7. Success: show all tx hashes + explorer links
   Multi-tx warning shown before signing:
   "This publish requires N transactions. Cancelling partway through
    will leave orphaned chunk records (harmless, but wasteful)."
```

**Hub call shape:**
```typescript
hub.signTransaction({
  appName: 'NimDexer',
  sender:              walletAddress,
  recipient:           NIMDEXER_CATALOG_ADDRESS,
  value:               1,           // 1 Luna (integer)
  fee:                 0,
  extraData:           txBytes,     // Uint8Array[64]
  validityStartHeight: await rpc.getBlockNumber(),
})
```

---

## Bootstrap & Config Scripts

### npm run bootstrap (scripts/bootstrap.ts)

```
1. Check .nimdexer/catalog.json
   → exists: show existing address, prompt to abort or regenerate (--force)

2. Generate catalog keypair with @nimiq/core Entropy.generate()
   → derive address via entropy.toExtendedPrivateKey().toAddress()
   → print address
   → prompt: "Store encrypted backup? (enter passphrase, or Enter to skip)"
     - if passphrase provided: AES-256-GCM-encrypt mnemonic, store in catalog.json
     - if skipped: catalog.json stores address + created_at only, no mnemonic
     - plaintext mnemonic never stored unless user types 'plaintext' and confirms
   → write .nimdexer/catalog.json (chmod 0600)
   → print mnemonic to terminal once with backup warning
   → NOTE: catalog wallet is a receive-only sink; no NIM balance required

3. Prompt: "Publisher address (paste NQ.. from Hub, or type 'generate' for new keypair)"
   → if pasted:
     - validate NQ address format
     - validate != catalog address
     - store address only (no key file for publisher)
   → if 'generate':
     - warn: "Day-to-day publishing should use Nimiq Hub. Generate anyway? (y/N)"
     - if confirmed: Entropy.generate(), same encrypt/mnemonic flow as catalog
     - save to .nimdexer/publisher.json (chmod 0600)
     - print mnemonic + strong backup warning
   → else: re-prompt

4. Upsert .env:
   VITE_NIMDEXER_CATALOG_ADDRESS=NQ..
   VITE_NIMDEXER_PUBLISHER_ADDRESS=NQ..

5. Print next steps:
   - Fund publisher wallet (needs NIM for tx fees)
   - Catalog wallet needs no balance (receive-only sink)
   - Run: npm run dev
   - Back up .nimdexer/ offline — never commit to git
```

### npm run show-config (scripts/show-config.ts)

Reads `.env` + `.nimdexer/*.json`, prints formatted summary:
```
Network:             mainnet
Catalog address:     NQ.. (key file present ✓)
Publisher address:   NQ.. (Hub wallet, no key file)
RPC URL:             https://rpc.nimiq.com
Catalog != publisher: ✓
```

---

## Docker / Deployment

### Dockerfile
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### nginx.conf
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

### docker-compose.yml
```yaml
services:
  nimdexer:
    build:
      context: .
      args:
        VITE_NIMIQ_NETWORK:                   ${VITE_NIMIQ_NETWORK:-mainnet}
        VITE_NIMIQ_RPC_URL:                   ${VITE_NIMIQ_RPC_URL}
        VITE_NIMIQ_HUB_URL:                   ${VITE_NIMIQ_HUB_URL:-}
        VITE_NIMIQ_EXPLORER_BASE_URL:         ${VITE_NIMIQ_EXPLORER_BASE_URL:-https://nimiqscan.com}
        VITE_NIMDEXER_CATALOG_ADDRESS:        ${VITE_NIMDEXER_CATALOG_ADDRESS}
        VITE_NIMDEXER_PUBLISHER_ADDRESS:      ${VITE_NIMDEXER_PUBLISHER_ADDRESS}
        VITE_NIMDEXER_ARTIFACT_BASE_URL:      ${VITE_NIMDEXER_ARTIFACT_BASE_URL:-}
        VITE_NIMDEXER_DEFAULT_TRACKER_SET_ID: ${VITE_NIMDEXER_DEFAULT_TRACKER_SET_ID:-0}
    ports:
      - "${PORT:-8080}:80"
    restart: unless-stopped
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| publisher_seq collision if two clients publish simultaneously | resolveNextSeq() syncs first; duplicate seqs decode but second is ignored (lower block_height wins) |
| MetadataChunks arrive before announce | handleMetadataChunk upserts rows without parent; handleAnnounce triggers assembly retroactively |
| Multi-tx partial publish (announce-last) | Orphaned chunks are harmless; publisher retries only announce; UI warns before multi-tx publish |
| Sync too stale at publish time | resolveNextSeq() throws if lastSyncedAt > 5 min; form shows stale warning |
| @nimiq/core version mismatch (scripts vs. runtime) | scripts only use @nimiq/core; runtime only uses @nimiq/hub-api; no shared dep |
| Large artifact history slows initial sync | Backfill budget 10s/tick, cursor-paginated; Dexie local cache means subsequent loads are instant |
| Unknown registry IDs break decode | Decoder always succeeds; unknown IDs render as "Unknown / unsupported" in UI |

---

## Implementation Phases

### Phase 1 — Protocol core
Files: `src/protocol/schema.ts`, `src/protocol/enums.ts`, `src/protocol/encoder.ts`, `src/protocol/decoder.ts`
Tests: encode→decode roundtrip for every record type and artifact type; CRC rejection; unknown registry IDs; btih-v1 zero-padding; uint64 size_bytes as string

### Phase 2 — Chain sync + local index
Files: `src/services/nimiqRpc.ts`, `src/db/dexie.ts`, `src/services/NimDexerIndexerService.ts`, `src/services/artifactResolver.ts`
Tests: mock RPC responses → verify Dexie state; MetadataChunk assembly; deprecation propagation; stale sync detection

### Phase 3 — Browse UI
Files: Vite scaffold, `src/stores/artifactStore.ts`, all browse views and components
Manual: verify liveQuery reactivity, filter combinations, magnet/URL generation, badge states

### Phase 4 — Publish UI + Hub + Docker
Files: `src/services/nimiqHub.ts`, `src/stores/publisherStore.ts`, publish views, `scripts/bootstrap.ts`, `scripts/show-config.ts`, `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.env.example`, `.gitignore`
Manual: full publish flow on testnet; multi-tx with MetadataChunk; bootstrap script flows (paste address, generate address, passphrase + skip); docker build + serve
