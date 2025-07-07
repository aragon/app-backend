import logger from '@logger'
import {
  IndexerType,
  IEnumIndexerService,
  ITokenType,
  ITokenSyncTagName,
  NetworksEnum,
  type IPluginInterfaceType,
  type LogServicePattern,
  type LogServiceInfo,
  type DepositLogService,
  type WithdrawLogService,
  type IndexerLogService,
  type PluginLogService,
  type DaoLogService,
  type TokenLogService,
  type PermissionLogService,
} from '@src/types'

const llo = logger.logMeta.bind(null, { service: 'helpers:ConfigIndexerHelper' })

// Helper to get valid token types for log service (excluding native and unknown)
const getValidTokenTypes = (): ITokenType[] => {
  return Object.values(ITokenType).filter(
    tokenType => tokenType !== ITokenType.native && tokenType !== ITokenType.unknown,
  )
}

// Helper to get all valid network values
const getValidNetworks = (): string[] => {
  return Object.values(NetworksEnum as any)
}

const ConfigIndexerHelper = {
  // Builder functions for creating type-safe logService values
  builders: {
    deposit: (address: string): DepositLogService => {
      const service = `${IndexerType.deposit}-${address}-${IEnumIndexerService.depositTxs}`
      return service as DepositLogService
    },

    withdraw: (address: string): WithdrawLogService => {
      const service = `${IndexerType.withdraw}-${address}-${IEnumIndexerService.withdrawTxs}`
      return service as WithdrawLogService
    },

    indexer: (network: NetworksEnum): IndexerLogService => {
      const service = `${IndexerType.indexer}-${network}`
      return service as IndexerLogService
    },

    plugin: (interfaceType: IPluginInterfaceType, network: NetworksEnum, address: string): PluginLogService => {
      const service = `${interfaceType}-${network}-${address}`
      return service as PluginLogService
    },

    dao: (network: NetworksEnum, address: string): DaoLogService => {
      const service = `${IndexerType.dao}-${network}-${address}`
      return service as DaoLogService
    },

    permission: (network: NetworksEnum, address: string): PermissionLogService => {
      const service = `${IndexerType.permission}-${network}-${address}`
      return service as PermissionLogService
    },

    token: (
      tokenType: ITokenType,
      network: NetworksEnum,
      address: string,
      syncTag?: ITokenSyncTagName,
    ): TokenLogService => {
      // Validate token type
      if (!ConfigIndexerHelper.utils.isValidTokenTypeForLogService(tokenType)) {
        throw new Error(`Invalid token type for logService: ${tokenType}. Cannot use 'native' or 'unknown'.`)
      }
      const service = syncTag ? `${tokenType}-${network}-${address}-${syncTag}` : `${tokenType}-${network}-${address}`
      return service as TokenLogService
    },
  },

  // Type guard functions for runtime checks
  guards: {
    isDeposit: (service: LogServicePattern): service is DepositLogService =>
      service?.startsWith(`${IndexerType.deposit}-`) ?? false,

    isWithdraw: (service: LogServicePattern): service is WithdrawLogService =>
      service?.startsWith(`${IndexerType.withdraw}-`) ?? false,

    isIndexer: (service: LogServicePattern): service is IndexerLogService =>
      service?.startsWith(`${IndexerType.indexer}-`) ?? false,

    isDao: (service: LogServicePattern): service is DaoLogService =>
      service?.startsWith(`${IndexerType.dao}-`) ?? false,

    isToken: (service: LogServicePattern): service is TokenLogService => {
      if (service === null) return false
      // Check if starts with any valid token type (excluding native and unknown)
      const validTokenTypes = getValidTokenTypes()
      return validTokenTypes.some(tokenType => service.startsWith(`${tokenType}-`))
    },

    isPermission: (service: LogServicePattern): service is PermissionLogService =>
      service?.startsWith(`${IndexerType.permission}-`) ?? false,

    isPlugin: (service: LogServicePattern): service is PluginLogService => {
      if (service === null) return false
      // If it's not any of the other types, and it's not null, it should be a plugin
      return (
        !ConfigIndexerHelper.guards.isDeposit(service) &&
        !ConfigIndexerHelper.guards.isWithdraw(service) &&
        !ConfigIndexerHelper.guards.isIndexer(service) &&
        !ConfigIndexerHelper.guards.isDao(service) &&
        !ConfigIndexerHelper.guards.isPermission(service) &&
        !ConfigIndexerHelper.guards.isToken(service)
      )
    },
  },

  // Parser to extract components from logService strings
  parser: {
    parse: (service: LogServicePattern): LogServiceInfo | null => {
      if (service === null) {
        logger.error('Parsing null logService', llo({ service }))
        return null
      }

      // Helper function to extract network from string parts
      const extractNetwork = (parts: string[], startIndex: number): { network: string; remainingParts: string[] } => {
        const validNetworks = getValidNetworks()

        // Try to find a valid network by combining parts
        for (let i = startIndex; i < parts.length; i++) {
          const possibleNetwork = parts.slice(startIndex, i + 1).join('-')
          if (validNetworks.includes(possibleNetwork)) {
            return {
              network: possibleNetwork,
              remainingParts: [...parts.slice(0, startIndex), possibleNetwork, ...parts.slice(i + 1)],
            }
          }
        }

        // If no valid network found, return the part at startIndex
        return {
          network: parts[startIndex],
          remainingParts: parts,
        }
      }

      const parts = service.split('-')

      if (ConfigIndexerHelper.guards.isDeposit(service)) {
        // deposit-{address}-depositTxs
        const addressParts = parts.slice(1, -1) // Everything between 'deposit' and 'depositTxs'
        return {
          type: IndexerType.deposit,
          address: addressParts.join('-'),
          service: parts[parts.length - 1] as IEnumIndexerService.depositTxs,
        }
      }

      if (ConfigIndexerHelper.guards.isWithdraw(service)) {
        // withdraw-{address}-withdrawTxs
        const addressParts = parts.slice(1, -1) // Everything between 'withdraw' and 'withdrawTxs'
        return {
          type: IndexerType.withdraw,
          address: addressParts.join('-'),
          service: parts[parts.length - 1] as IEnumIndexerService.withdrawTxs,
        }
      }

      if (ConfigIndexerHelper.guards.isIndexer(service)) {
        // indexer-{network}
        const { network } = extractNetwork(parts, 1)
        return {
          type: IndexerType.indexer,
          network: network as NetworksEnum,
        }
      }

      if (ConfigIndexerHelper.guards.isDao(service)) {
        // dao-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.dao,
          network: network as NetworksEnum,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isPermission(service)) {
        // selectorPermission-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.permission,
          network: network as NetworksEnum,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isToken(service)) {
        // {tokenType}-{network}-{address}[-{syncTag}]
        const tokenType = parts[0] as ITokenType
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const afterNetworkParts = remainingParts.slice(networkIndex + 1)

        let address: string
        let syncTag: ITokenSyncTagName | undefined

        // If we have more than one part after the network, check if the last part could be a sync tag
        if (afterNetworkParts.length > 1) {
          const lastPart = afterNetworkParts[afterNetworkParts.length - 1]

          // Check if it's a valid sync tag
          if (ConfigIndexerHelper.utils.isValidSyncTag(lastPart)) {
            // Valid sync tag
            address = afterNetworkParts.slice(0, -1).join('-')
            syncTag = lastPart
          } else {
            // This handles invalid syncTag 'ERC20-ethereum-mainnet-0x123-invalid' -> address='0x123'
            address = afterNetworkParts.slice(0, -1).join('-')
          }
        } else {
          // Only one part after network, it's the address
          address = afterNetworkParts.join('-')
        }

        const result: LogServiceInfo = {
          type: IndexerType.token,
          tokenType,
          network: network as NetworksEnum,
          address,
        }

        if (syncTag) {
          result.syncTag = syncTag
        }

        return result
      }

      // Default to plugin pattern
      // {interfaceType}-{network}-{address}
      const interfaceType = parts[0]
      const { network, remainingParts } = extractNetwork(parts, 1)
      const networkIndex = remainingParts.indexOf(network)
      const addressParts = remainingParts.slice(networkIndex + 1)

      return {
        type: IndexerType.plugin,
        interfaceType: interfaceType as IPluginInterfaceType,
        network: network as NetworksEnum,
        address: addressParts.join('-'),
      }
    },

    // Helper to get type of service
    getType: (service: LogServicePattern): string | null => {
      if (service === null) return null

      // Validate that this is actually a valid service before returning a type
      if (!ConfigIndexerHelper.validators.isValidLogService(service)) {
        return null
      }

      if (ConfigIndexerHelper.guards.isDeposit(service)) return IndexerType.deposit
      if (ConfigIndexerHelper.guards.isWithdraw(service)) return IndexerType.withdraw
      if (ConfigIndexerHelper.guards.isIndexer(service)) return IndexerType.indexer
      if (ConfigIndexerHelper.guards.isDao(service)) return IndexerType.dao
      if (ConfigIndexerHelper.guards.isToken(service)) return IndexerType.token
      if (ConfigIndexerHelper.guards.isPermission(service)) return IndexerType.permission
      if (ConfigIndexerHelper.guards.isPlugin(service)) return IndexerType.plugin

      return null
    },

    // Helper to check if a token service has a sync tag
    hasSyncTag: (service: LogServicePattern): boolean => {
      if (!ConfigIndexerHelper.guards.isToken(service)) return false

      // Parse the service to check for sync tag
      const parsed = ConfigIndexerHelper.parser.parse(service)
      return parsed?.type === 'token' && !!parsed.syncTag
    },

    // Helper to get sync tag from token service
    getSyncTag: (service: LogServicePattern): ITokenSyncTagName | null => {
      if (!ConfigIndexerHelper.guards.isToken(service)) return null

      // Parse the service to get sync tag
      const parsed = ConfigIndexerHelper.parser.parse(service)
      if (parsed?.type === 'token' && parsed.syncTag) {
        return parsed.syncTag
      }
      return null
    },
  },

  // Validation helpers
  validators: {
    isValidLogService: (service: LogServicePattern): service is LogServicePattern => {
      if (!service) return false

      // For the string to be valid, it must have at least 2 parts separated by '-'
      const parts = (service as string).split('-')
      if (parts.length < 2) return false

      // Check that it has a valid network
      const validNetworks = getValidNetworks()
      let hasValidNetwork = false

      // Check if any part or combination of parts forms a valid network
      for (let i = 0; i < parts.length; i++) {
        for (let j = i; j < parts.length; j++) {
          const possibleNetwork = parts.slice(i, j + 1).join('-')
          if (validNetworks.includes(possibleNetwork)) {
            hasValidNetwork = true
            break
          }
        }
        if (hasValidNetwork) break
      }

      // For services other than indexer, must have valid network and more parts
      if (service.startsWith(`${IndexerType.indexer}-`)) {
        return hasValidNetwork
      }

      // All other services need at least 3 parts (type-network-address minimum)
      if (parts.length < 3) return false

      // Check if it matches any of our patterns
      return (
        ConfigIndexerHelper.guards.isDeposit(service) ||
        ConfigIndexerHelper.guards.isWithdraw(service) ||
        ConfigIndexerHelper.guards.isIndexer(service) ||
        ConfigIndexerHelper.guards.isDao(service) ||
        ConfigIndexerHelper.guards.isToken(service) ||
        ConfigIndexerHelper.guards.isPermission(service) ||
        (ConfigIndexerHelper.guards.isPlugin(service) && hasValidNetwork)
      )
    },

    validateAndParse: (service: LogServicePattern): LogServiceInfo | null => {
      if (!ConfigIndexerHelper.validators.isValidLogService(service)) {
        logger.error('Invalid logService format', llo({ service }))
        return null
      }
      return ConfigIndexerHelper.parser.parse(service)
    },
  },

  // Utility functions
  utils: {
    // Get all valid token types that can be used in logService
    getValidTokenTypes,

    // Check if a token type is valid for logService
    isValidTokenTypeForLogService: (tokenType: ITokenType): boolean => {
      return tokenType !== ITokenType.native && tokenType !== ITokenType.unknown
    },

    // Get all valid sync tags
    getValidSyncTags: (): ITokenSyncTagName[] => {
      return Object.values(ITokenSyncTagName)
    },

    // Check if a string is a valid sync tag
    isValidSyncTag: (tag: string): tag is ITokenSyncTagName => {
      return Object.values(ITokenSyncTagName).includes(tag as ITokenSyncTagName)
    },

    // Create a token service with sync tag from an existing one
    addSyncTagToTokenService: (service: TokenLogService, syncTag: ITokenSyncTagName): TokenLogService => {
      if (!ConfigIndexerHelper.guards.isToken(service)) {
        throw new Error('Service must be a token service')
      }

      // Parse the service first to get its components
      const parsed = ConfigIndexerHelper.parser.parse(service)
      if (parsed?.type !== 'token') {
        throw new Error('Failed to parse token service')
      }

      // Rebuild with the new sync tag
      return ConfigIndexerHelper.builders.token(parsed.tokenType, parsed.network, parsed.address, syncTag)
    },

    // Remove sync tag from a token service
    removeSyncTagFromTokenService: (service: TokenLogService): TokenLogService => {
      if (!ConfigIndexerHelper.guards.isToken(service)) {
        throw new Error('Service must be a token service')
      }

      // Parse the service first to get its components
      const parsed = ConfigIndexerHelper.parser.parse(service)
      if (parsed?.type !== 'token') {
        throw new Error('Failed to parse token service')
      }

      // Rebuild without sync tag
      return ConfigIndexerHelper.builders.token(parsed.tokenType, parsed.network, parsed.address)
    },
  },
}

export default ConfigIndexerHelper
