import logger from '@logger'
import {
  IndexerType,
  ITokenType,
  NetworksEnum,
  type IPluginInterfaceType,
  type LogServicePattern,
  type LogServiceInfo,
  type IndexerLogService,
  type PluginLogService,
  type DaoLogService,
  type TokenLogService,
  type PermissionLogService,
  type TransferListLogService,
  type LockManagerLogService,
  type TokenDepositLogService,
  type TokenWithdrawLogService,
  type NativeDepositLogService,
  type NativeWithdrawLogService,
  type HexAddress,
  type CampaignStrategyLogService,
  type TransferLogService,
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
    indexer: (network: NetworksEnum): IndexerLogService => {
      const service = `${IndexerType.indexer}-${network}`
      return service as IndexerLogService
    },

    transfer: (network: NetworksEnum): TransferLogService => {
      const service = `${IndexerType.transfer}-${network}`
      return service as TransferLogService
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

    transferList: (network: NetworksEnum, address: string): TransferListLogService => {
      const service = `${IndexerType.transferList}-${network}-${address}`
      return service as TransferListLogService
    },

    lockManager: (network: NetworksEnum, address: HexAddress): LockManagerLogService => {
      const service = `${IndexerType.lockManager}-${network}-${address}`
      return service as LockManagerLogService
    },

    token: (tokenType: ITokenType, network: NetworksEnum, address: string): TokenLogService => {
      // Validate token type
      if (!ConfigIndexerHelper.utils.isValidTokenTypeForLogService(tokenType)) {
        throw new Error(`Invalid token type for logService: ${tokenType}. Cannot use 'native' or 'unknown'.`)
      }
      const service = `${tokenType}-${network}-${address}`
      return service as TokenLogService
    },

    nativeDeposit: (network: NetworksEnum, address: string): NativeDepositLogService => {
      const service = `${IndexerType.nativeDeposit}-${network}-${address}`
      return service as NativeDepositLogService
    },

    nativeWithdraw: (network: NetworksEnum, address: string): NativeWithdrawLogService => {
      const service = `${IndexerType.nativeWithdraw}-${network}-${address}`
      return service as NativeWithdrawLogService
    },

    tokenDeposit: (network: NetworksEnum, address: string): TokenDepositLogService => {
      const service = `${IndexerType.tokenDeposit}-${network}-${address}`
      return service as TokenDepositLogService
    },

    tokenWithdraw: (network: NetworksEnum, address: string): TokenWithdrawLogService => {
      const service = `${IndexerType.tokenWithdraw}-${network}-${address}`
      return service as TokenWithdrawLogService
    },

    // // @deprecated - These are kept for backward compatibility with migrations
    // deposit: (network: NetworksEnum, address: string): any => {
    //   const service = `deposit-${network}-${address}-depositTxs`
    //   return service
    // },
    //
    // // @deprecated - These are kept for backward compatibility with migrations
    // withdraw: (network: NetworksEnum, address: string): any => {
    //   const service = `withdraw-${network}-${address}-withdrawTxs`
    //   return service
    // },

    campaignAllocationStrategy: (network: NetworksEnum, address: HexAddress): CampaignStrategyLogService => {
      const service = `${IndexerType.campaignStrategy}-${network}-${address}`
      return service as CampaignStrategyLogService
    },
  },

  // Type guard functions for runtime checks
  guards: {
    isIndexer: (service: LogServicePattern): service is IndexerLogService =>
      service?.startsWith(`${IndexerType.indexer}-`) ?? false,

    isTransfer: (service: LogServicePattern): service is TransferLogService =>
      service?.startsWith(`${IndexerType.transfer}-`) ?? false,

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

    isTransferList: (service: LogServicePattern): service is TransferListLogService =>
      service?.startsWith(`${IndexerType.transferList}-`) ?? false,

    isLockManager: (service: LogServicePattern): service is LockManagerLogService =>
      service?.startsWith(`${IndexerType.lockManager}-`) ?? false,

    isTokenDeposit: (service: LogServicePattern): service is TokenDepositLogService =>
      service?.startsWith(`${IndexerType.tokenDeposit}-`) ?? false,

    isTokenWithdraw: (service: LogServicePattern): service is TokenWithdrawLogService =>
      service?.startsWith(`${IndexerType.tokenWithdraw}-`) ?? false,

    isNativeDeposit: (service: LogServicePattern): service is NativeDepositLogService =>
      service?.startsWith(`${IndexerType.nativeDeposit}-`) ?? false,

    isNativeWithdraw: (service: LogServicePattern): service is NativeWithdrawLogService =>
      service?.startsWith(`${IndexerType.nativeWithdraw}-`) ?? false,

    isCampaignStrategy: (service: LogServicePattern): service is CampaignStrategyLogService =>
      service?.startsWith(`${IndexerType.campaignStrategy}-`) ?? false,

    isPlugin: (service: LogServicePattern): service is PluginLogService => {
      if (service === null) return false
      // If it's not any of the other types, and it's not null, it should be a plugin
      return (
        !ConfigIndexerHelper.guards.isIndexer(service) &&
        !ConfigIndexerHelper.guards.isTransfer(service) &&
        !ConfigIndexerHelper.guards.isDao(service) &&
        !ConfigIndexerHelper.guards.isPermission(service) &&
        !ConfigIndexerHelper.guards.isToken(service) &&
        !ConfigIndexerHelper.guards.isTransferList(service) &&
        !ConfigIndexerHelper.guards.isLockManager(service) &&
        !ConfigIndexerHelper.guards.isTokenDeposit(service) &&
        !ConfigIndexerHelper.guards.isTokenWithdraw(service) &&
        !ConfigIndexerHelper.guards.isNativeDeposit(service) &&
        !ConfigIndexerHelper.guards.isNativeWithdraw(service) &&
        !ConfigIndexerHelper.guards.isLockManager(service) &&
        !ConfigIndexerHelper.guards.isCampaignStrategy(service)
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
      const extractNetwork = (
        parts: string[],
        startIndex: number,
      ): {
        network: NetworksEnum
        remainingParts: string[]
      } => {
        const validNetworks = getValidNetworks()

        // Try to find a valid network by combining parts
        for (let i = startIndex; i < parts.length; i++) {
          const possibleNetwork = parts.slice(startIndex, i + 1).join('-')
          if (validNetworks.includes(possibleNetwork)) {
            return {
              network: possibleNetwork as NetworksEnum,
              remainingParts: [...parts.slice(0, startIndex), possibleNetwork, ...parts.slice(i + 1)],
            }
          }
        }

        // If no valid network found, return the part at startIndex
        return {
          network: parts[startIndex] as NetworksEnum,
          remainingParts: parts,
        }
      }

      const parts = service.split('-')

      if (ConfigIndexerHelper.guards.isIndexer(service)) {
        // indexer-{network}
        const { network } = extractNetwork(parts, 1)
        return {
          type: IndexerType.indexer,
          network,
        }
      }

      if (ConfigIndexerHelper.guards.isTransfer(service)) {
        // transfer-{network}
        const { network } = extractNetwork(parts, 1)
        return {
          type: IndexerType.transfer,
          network,
        }
      }

      if (ConfigIndexerHelper.guards.isDao(service)) {
        // dao-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.dao,
          network,
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
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isTransferList(service)) {
        // transferList-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.transferList,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isLockManager(service)) {
        // lockManager-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.lockManager,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isTokenDeposit(service)) {
        // tokenDeposit-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.tokenDeposit,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isTokenWithdraw(service)) {
        // tokenWithdraw-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.tokenWithdraw,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isNativeDeposit(service)) {
        // nativeDeposit-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.nativeDeposit,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isNativeWithdraw(service)) {
        // nativeWithdraw-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.nativeWithdraw,
          network,
          address: addressParts.join('-'),
        }
      }

      if (ConfigIndexerHelper.guards.isToken(service)) {
        // {tokenType}-{network}-{address}
        const tokenType = parts[0] as ITokenType
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const afterNetworkParts = remainingParts.slice(networkIndex + 1)

        let address: string

        // If we have more than one part after the network, check if the last part could be a sync tag
        if (afterNetworkParts.length > 1) {
          // This handles invalid syncTag 'ERC20-ethereum-mainnet-0x123-invalid' -> address='0x123'
          address = afterNetworkParts.slice(0, -1).join('-')
        } else {
          // Only one part after network, it's the address
          address = afterNetworkParts.join('-')
        }

        const result: LogServiceInfo = {
          type: IndexerType.token,
          tokenType,
          network,
          address,
        }

        return result
      }

      if (ConfigIndexerHelper.guards.isCampaignStrategy(service)) {
        // campaignStrategy-{network}-{address}
        const { network, remainingParts } = extractNetwork(parts, 1)
        const networkIndex = remainingParts.indexOf(network)
        const addressParts = remainingParts.slice(networkIndex + 1)

        return {
          type: IndexerType.campaignStrategy,
          network,
          address: addressParts.join('-'),
        }
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
        network,
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

      if (ConfigIndexerHelper.guards.isIndexer(service)) return IndexerType.indexer
      if (ConfigIndexerHelper.guards.isTransfer(service)) return IndexerType.transfer
      if (ConfigIndexerHelper.guards.isDao(service)) return IndexerType.dao
      if (ConfigIndexerHelper.guards.isToken(service)) return IndexerType.token
      if (ConfigIndexerHelper.guards.isPermission(service)) return IndexerType.permission
      if (ConfigIndexerHelper.guards.isTransferList(service)) return IndexerType.transferList
      if (ConfigIndexerHelper.guards.isLockManager(service)) return IndexerType.lockManager
      if (ConfigIndexerHelper.guards.isTokenDeposit(service)) return IndexerType.tokenDeposit
      if (ConfigIndexerHelper.guards.isTokenWithdraw(service)) return IndexerType.tokenWithdraw
      if (ConfigIndexerHelper.guards.isNativeDeposit(service)) return IndexerType.nativeDeposit
      if (ConfigIndexerHelper.guards.isNativeWithdraw(service)) return IndexerType.nativeWithdraw
      if (ConfigIndexerHelper.guards.isCampaignStrategy(service)) return IndexerType.campaignStrategy
      if (ConfigIndexerHelper.guards.isPlugin(service)) return IndexerType.plugin

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

      // For indexer and transfer services, only need valid network (no address)
      if (service.startsWith(`${IndexerType.indexer}-`) || service.startsWith(`${IndexerType.transfer}-`)) {
        return hasValidNetwork
      }

      // All other services need at least 3 parts (type-network-address minimum)
      if (parts.length < 3) return false

      // Check if it matches any of our patterns
      return (
        ConfigIndexerHelper.guards.isIndexer(service) ||
        ConfigIndexerHelper.guards.isTransfer(service) ||
        ConfigIndexerHelper.guards.isDao(service) ||
        ConfigIndexerHelper.guards.isToken(service) ||
        ConfigIndexerHelper.guards.isPermission(service) ||
        ConfigIndexerHelper.guards.isTransferList(service) ||
        ConfigIndexerHelper.guards.isLockManager(service) ||
        ConfigIndexerHelper.guards.isTokenDeposit(service) ||
        ConfigIndexerHelper.guards.isTokenWithdraw(service) ||
        ConfigIndexerHelper.guards.isNativeDeposit(service) ||
        ConfigIndexerHelper.guards.isNativeWithdraw(service) ||
        ConfigIndexerHelper.guards.isCampaignStrategy(service) ||
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
  },
}

export default ConfigIndexerHelper
