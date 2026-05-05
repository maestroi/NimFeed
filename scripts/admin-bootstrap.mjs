#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, createCipheriv } from 'node:crypto'
import { Entropy } from '@nimiq/core'

const ROLES = ['catalog', 'bootstrap', 'treasury']
const NETWORKS = ['mainnet', 'testnet']

function printUsage() {
  console.log(`NimFeed Admin Bootstrap CLI

Usage:
  node scripts/admin-bootstrap.mjs wallet:create --role <role> --network <network> [options]
  node scripts/admin-bootstrap.mjs wallet:create-all --network <network> [options]
  node scripts/admin-bootstrap.mjs wallet:funding
  node scripts/admin-bootstrap.mjs config:export-env [options]

Roles:
  ${ROLES.join(', ')}

Networks:
  ${NETWORKS.join(', ')}

Options:
  --out-dir <path>             Output directory (default: .nimfeed-admin)
  --passphrase <text>          Encrypt mnemonic backup at rest with AES-256-GCM
  --app-env-file <path>        Env file for config export (default: .env.local)
  --store-mnemonic             Store mnemonic in wallet file (default: true)
  --no-store-mnemonic          Do not store mnemonic in wallet file
  --print-mnemonic             Print mnemonic to terminal (default: true)
  --no-print-mnemonic          Do not print mnemonic to terminal
  --network <network>          For config export, also set VITE_NIMFEED_NETWORK
  --force                      Overwrite existing wallet file
  -h, --help                   Show this help
`)
}

function fail(message, code = 1) {
  console.error(`Error: ${message}`)
  process.exit(code)
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  const flags = {}

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (!token.startsWith('--')) continue

    if (token.startsWith('--no-')) {
      flags[token.slice(5)] = false
      continue
    }

    const key = token.slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
      continue
    }

    flags[key] = next
    i++
  }

  return { command, flags }
}

function normalizeNetwork(raw) {
  const network = String(raw || '').toLowerCase()
  if (!NETWORKS.includes(network)) fail(`Invalid --network. Use one of: ${NETWORKS.join(', ')}`)
  return network
}

function normalizeRole(raw) {
  const role = String(raw || '').toLowerCase()
  if (!ROLES.includes(role)) fail(`Invalid --role. Use one of: ${ROLES.join(', ')}`)
  return role
}

function resolveOutDir(raw) {
  return path.resolve(process.cwd(), raw || '.nimfeed-admin')
}

function encryptMnemonic(mnemonic, passphrase) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(passphrase, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    format: 'nimfeed-aes-256-gcm-v1',
    kdf: 'scrypt',
    salt_hex: salt.toString('hex'),
    iv_hex: iv.toString('hex'),
    tag_hex: tag.toString('hex'),
    ciphertext_hex: ciphertext.toString('hex'),
  }
}

function walletFilePath(outDir, network, role) {
  return path.join(outDir, network, `${role}.json`)
}

function writeWalletFile(filePath, payload, force) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (fs.existsSync(filePath) && !force) {
    fail(`Wallet file already exists: ${filePath}. Use --force to overwrite.`)
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 })
}

function createWallet({ role, network, outDir, passphrase, storeMnemonic, printMnemonic, force }) {
  const entropy = Entropy.generate()
  const mnemonic = entropy.toMnemonic().join(' ')
  const address = entropy.toExtendedPrivateKey().toAddress().toUserFriendlyAddress()

  const filePath = walletFilePath(outDir, network, role)
  const now = new Date().toISOString()

  const payload = {
    id: `${network}-${role}-${Date.now()}`,
    role,
    network,
    address,
    created_at: now,
    backup: passphrase
      ? { encrypted_mnemonic: encryptMnemonic(mnemonic, passphrase) }
      : storeMnemonic
        ? { mnemonic }
        : null,
  }

  writeWalletFile(filePath, payload, force)

  console.log(`\nCreated ${role} wallet (${network})`)
  console.log(`Address: ${address}`)
  console.log(`Saved:   ${filePath}`)

  if (passphrase) {
    console.log('Mnemonic backup: encrypted and stored in wallet file')
  } else if (storeMnemonic) {
    console.log('Mnemonic backup: plain text and stored in wallet file')
  } else {
    console.log('Mnemonic backup: not stored on disk')
  }

  if (printMnemonic) {
    console.log('\nMnemonic (store offline):')
    console.log(mnemonic)
  }

  return payload
}

function runWalletCreate(flags) {
  const role = normalizeRole(flags.role)
  const network = normalizeNetwork(flags.network)
  const outDir = resolveOutDir(flags['out-dir'])
  const passphrase = typeof flags.passphrase === 'string' ? flags.passphrase : null
  const storeMnemonic = flags['store-mnemonic'] !== false
  const printMnemonic = flags['print-mnemonic'] !== false
  const force = !!flags.force

  createWallet({ role, network, outDir, passphrase, storeMnemonic, printMnemonic, force })
}

function runWalletCreateAll(flags) {
  const network = normalizeNetwork(flags.network)
  const outDir = resolveOutDir(flags['out-dir'])
  const passphrase = typeof flags.passphrase === 'string' ? flags.passphrase : null
  const storeMnemonic = flags['store-mnemonic'] !== false
  const printMnemonic = flags['print-mnemonic'] !== false
  const force = !!flags.force

  const created = []
  for (const role of ROLES) {
    created.push(createWallet({ role, network, outDir, passphrase, storeMnemonic, printMnemonic, force }))
  }

  console.log('\nSummary:')
  for (const w of created) {
    console.log(`- ${w.role}: ${w.address}`)
  }
}

function runWalletFunding() {
  console.log('Funding guidance for bootstrap operations:')
  console.log('- catalog wallet: does not need funds for receive-only role')
  console.log('- bootstrap wallet: needs NIM balance to pay tx value/fees for admin actions')
  console.log('- treasury wallet: optional reserve used to top up bootstrap wallet')
  console.log('- end users: each user wallet also needs balance for their own transactions')
}

function readWalletAddress(outDir, network, role) {
  const filePath = walletFilePath(outDir, network, role)
  if (!fs.existsSync(filePath)) return null
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return typeof raw.address === 'string' ? raw.address.trim() : null
}

function upsertEnvVars(filePath, vars) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : []
  const keys = new Set(Object.keys(vars))
  const next = []

  for (const line of existing) {
    let replaced = false
    for (const [key, value] of Object.entries(vars)) {
      if (line.startsWith(`${key}=`)) {
        next.push(`${key}=${value}`)
        keys.delete(key)
        replaced = true
        break
      }
    }
    if (!replaced && line.length) next.push(line)
  }

  for (const key of keys) next.push(`${key}=${vars[key]}`)
  fs.writeFileSync(filePath, next.join('\n') + '\n', { mode: 0o600 })
}

function runConfigExportEnv(flags) {
  const outDir = resolveOutDir(flags['out-dir'])
  const envFile = path.resolve(process.cwd(), flags['app-env-file'] || '.env.local')
  const vars = {}

  const mainnetCatalog = readWalletAddress(outDir, 'mainnet', 'catalog')
  const testnetCatalog = readWalletAddress(outDir, 'testnet', 'catalog')
  const mainnetBootstrap = readWalletAddress(outDir, 'mainnet', 'bootstrap')
  const testnetBootstrap = readWalletAddress(outDir, 'testnet', 'bootstrap')

  if (mainnetCatalog) vars.VITE_NIMFEED_MAINNET_CATALOG_ADDRESS = mainnetCatalog
  if (testnetCatalog) vars.VITE_NIMFEED_TESTNET_CATALOG_ADDRESS = testnetCatalog
  if (mainnetBootstrap) vars.VITE_NIMFEED_MAINNET_BOOTSTRAP_ADDRESS = mainnetBootstrap
  if (testnetBootstrap) vars.VITE_NIMFEED_TESTNET_BOOTSTRAP_ADDRESS = testnetBootstrap

  if (flags.network) {
    const network = normalizeNetwork(flags.network)
    vars.VITE_NIMFEED_NETWORK = network
    const selectedBootstrap = network === 'mainnet' ? mainnetBootstrap : testnetBootstrap
    if (selectedBootstrap) vars.VITE_NIMFEED_DATA_RECIPIENT_ADDRESS = selectedBootstrap
  }

  if (!Object.keys(vars).length) {
    fail(`No wallet files found under ${outDir} for mainnet/testnet.`)
  }

  upsertEnvVars(envFile, vars)

  console.log(`Exported NimFeed env config to ${envFile}`)
  for (const [key, value] of Object.entries(vars)) {
    console.log(`- ${key}=${value}`)
  }
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))

  if (!command || command === '-h' || command === '--help' || flags.help || flags.h) {
    printUsage()
    return
  }

  switch (command) {
    case 'wallet:create':
      return runWalletCreate(flags)
    case 'wallet:create-all':
      return runWalletCreateAll(flags)
    case 'wallet:funding':
      return runWalletFunding()
    case 'config:export-env':
      return runConfigExportEnv(flags)
    default:
      fail(`Unknown command: ${command}`)
  }
}

main()
