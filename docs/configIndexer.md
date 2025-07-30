# ConfigIndexer Documentation

## Overview

You can use the ConfigIndexerHelper to type-safe creation, parsing, and validation of log service identifiers used in the indexer system.
It ensures consistent formatting and provides runtime type checking for different service patterns.

## Service Name Formats

The helper supports 6 different service types, each with a specific format:

### 1. Deposit Service
Used to track deposit transactions log events for a specific DAO.

- **Format:** `deposit-{daoAddress}-depositTxs`
- **Example:** `deposit-0x123456789abcdef-depositTxs`

### 2. Withdraw Service
Used to track withdrawal transactions log events for a specific DAO.

- **Format:** `withdraw-{daoAddress}-withdrawTxs`
- **Example:** `withdraw-0xabcdef123456789-withdrawTxs`

### 3. Indexer Service
Used to track realtime log events.

- **Format:** `indexer-{network}`
- **Example:** `indexer-ethereum-mainnet`

### 4. DAO Service
Used to track dao log events for a specific DAO.

- **Format:** `dao-{network}-{address}`
- **Example:** `dao-polygon-mainnet-0x789abc`

### 5. Plugin Service
Used to track plugin log events for a specific Plugin.

- **Format:** `{pluginInterfaceType}-{network}-{address}`
- **Example:** `voting-ethereum-mainnet-0x123`
- **Example:** `staking-base-mainnet-0xabc`

### 6. Token Service
Used to track token log events for a specific Token.

**Basic format (without sync tag):**
- **Format:** `{tokenType}-{network}-{address}`
- **Examples:**
    - `ERC20-ethereum-mainnet-0x123`
    - `ERC721-polygon-mainnet-0x456`
    - `ERC1155-base-mainnet-0x789`
    - `ERC777-arbitrum-mainnet-0xabc`
    - `escrowAdapter-optimism-mainnet-0xdef`

**Extended format (with sync tag for api sync):**
- **Format:** `{tokenType}-{network}-{address}-{syncTag}`
- **Examples:**
    - `ERC20-ethereum-mainnet-0x123-delegates`
    - `ERC721-polygon-mainnet-0x456-transfers`
    - `ERC1155-base-mainnet-0x789-holders`

## Supported Values

### Networks
- `ethereum-mainnet`
- `ethereum-sepolia`
- `polygon-mainnet`
- `base-mainnet`
- `arbitrum-mainnet`
- `zksync-sepolia`
- `zksync-mainnet`
- `optimism-mainnet`
- `peaq-mainnet`
- `chiliz-mainnet`
- `corn-mainnet`

### Token Types
- `ERC20`
- `ERC721`
- `ERC1155`
- `ERC777`
- `escrowAdapter`

> **Note:** `native` and `unknown` token types are NOT supported for logService
### Token Sync Tags (Optional)
- `delegates` - Sync token delegation data
- `transfers` - Sync token transfer history
- `holders` - Sync token holder information

## Usage Guide

### 1. Creating Service Identifiers (Builders)

```typescript
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworksEnum, ITokenType, ITokenSyncTagName } from '@types'

// Deposit Service (daoAddress represents the DAO contract address)
const depositService = ConfigIndexerHelper.builders.deposit('0x123456789')
// Result: "deposit-0x123456789-depositTxs"

// Withdraw Service (daoAddress represents the DAO contract address)
const withdrawService = ConfigIndexerHelper.builders.withdraw('0xabcdef123')
// Result: "withdraw-0xabcdef123-withdrawTxs"

// Indexer Service
const indexerService = ConfigIndexerHelper.builders.indexer(NetworksEnum.ethereumMainnet)
// Result: "indexer-ethereum-mainnet"

// DAO Service
const daoService = ConfigIndexerHelper.builders.dao(
  NetworksEnum.polygonMainnet,
  '0xdao123'
)
// Result: "dao-polygon-mainnet-0xdao123"

// Plugin Service
const pluginService = ConfigIndexerHelper.builders.plugin(
  'voting', // IPluginInterfaceType
  NetworksEnum.baseMainnet,
  '0xplugin456'
)
// Result: "voting-base-mainnet-0xplugin456"

// Token Service (without sync tag)
const tokenService = ConfigIndexerHelper.builders.token(
  ITokenType.ERC20,
  NetworksEnum.arbitrumMainnet,
  '0xtoken789'
)
// Result: "ERC20-arbitrum-mainnet-0xtoken789"

// Token Service (with sync tag)
const tokenWithSync = ConfigIndexerHelper.builders.token(
  ITokenType.ERC721,
  NetworksEnum.optimismMainnet,
  '0xnft123',
  ITokenSyncTagName.delegates
)
// Result: "ERC721-optimism-mainnet-0xnft123-delegates"

```

### 2. Type Guards

Use guards to check the type of a service at runtime:

```typescript
const service = 'deposit-0x123-depositTxs'

if (ConfigIndexerHelper.guards.isDeposit(service)) {
  // TypeScript knows this is a DepositLogService
  console.log('Processing deposit transactions')
}

// All available guards:
ConfigIndexerHelper.guards.isDeposit(service)   // checks if deposit service
ConfigIndexerHelper.guards.isWithdraw(service)  // checks if withdraw service
ConfigIndexerHelper.guards.isIndexer(service)   // checks if indexer service
ConfigIndexerHelper.guards.isDao(service)       // checks if dao service
ConfigIndexerHelper.guards.isToken(service)     // checks if token service
ConfigIndexerHelper.guards.isPlugin(service)    // checks if plugin service
```

### 3. Parsing Services

Extract components from service strings:

```typescript
const parsed = ConfigIndexerHelper.parser.parse('ERC20-ethereum-mainnet-0x123-delegates')

// Result:
{
  type: 'token',
  tokenType: 'ERC20',
  network: 'ethereum-mainnet',
  address: '0x123',
  syncTag: 'delegates'
}

// Parse different service types
const depositParsed = ConfigIndexerHelper.parser.parse('deposit-0x456-depositTxs')
// Result: { type: 'deposit', address: '0x456', service: 'depositTxs' }
// Note: 'address' here is the DAO address

const daoParsed = ConfigIndexerHelper.parser.parse('dao-polygon-mainnet-0x789')
// Result: { type: 'dao', network: 'polygon-mainnet', address: '0x789' }
```

### 4. Get Service Type

```typescript
const serviceType = ConfigIndexerHelper.parser.getType('deposit-0x123-depositTxs')
// Result: 'deposit'

const tokenType = ConfigIndexerHelper.parser.getType('ERC20-ethereum-mainnet-0x456')
// Result: 'token'

const invalidType = ConfigIndexerHelper.parser.getType('invalid-service')
// Result: null
```

### 5. Working with Token Sync Tags

```typescript
// Check if a token service has a sync tag
const hasTag = ConfigIndexerHelper.parser.hasSyncTag('ERC20-ethereum-mainnet-0x123-delegates')
// Result: true

// Get the sync tag
const syncTag = ConfigIndexerHelper.parser.getSyncTag('ERC20-ethereum-mainnet-0x123-transfers')
// Result: 'transfers'

// Add sync tag to existing token service
const basic = 'ERC20-ethereum-mainnet-0x123'
const withTag = ConfigIndexerHelper.utils.addSyncTagToTokenService(
  basic,
  ITokenSyncTagName.holders
)
// Result: "ERC20-ethereum-mainnet-0x123-holders"

// Remove sync tag
const removed = ConfigIndexerHelper.utils.removeSyncTagFromTokenService(withTag)
// Result: "ERC20-ethereum-mainnet-0x123"
```

### 6. Validation

```typescript
// Check if a string is a valid log service
const isValid = ConfigIndexerHelper.validators.isValidLogService('deposit-0x123-depositTxs')
// Result: true

const isInvalid = ConfigIndexerHelper.validators.isValidLogService('invalid-format')
// Result: false

// Validate and parse in one step
const result = ConfigIndexerHelper.validators.validateAndParse('dao-ethereum-mainnet-0x456')
// Result: { type: 'dao', network: 'ethereum-mainnet', address: '0x456' }
// Returns null if invalid
```
