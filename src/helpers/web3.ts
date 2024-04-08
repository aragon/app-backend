import type { HexAddress, NetworksEnum } from '@types'
import { type Log, type Filter, getAddress, type WebSocketProvider, Contract, namehash } from 'ethers'
import { ConfigState } from '@state/configState'
import { ensRegistryABI } from '@abis/ensRegistryABI'
import logger from '@logger'
import config from '@config'
const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Utils' })

const Web3Utils = {
  parseAddress(address: HexAddress, extraLog?: any): HexAddress | null {
    try {
      return getAddress(address) as HexAddress
    } catch (error) {
      logger.error('Error checksum dao address', llo({ address, error, extraLog }))
      return null
    }
  },

  async getAddressFromEns(name: string, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const address = (await provider.resolveName(name)) as HexAddress | null
      return address
    } catch (error) {
      logger.error('Error resolving ENS name', llo({ name, network }))
      return null
    }
  },

  async getEnsFromAddress(address: string, network: NetworksEnum): Promise<string | null> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const ensName = await provider.lookupAddress(address)
      return ensName
    } catch (error) {
      logger.error('Error looking up address', llo({ address, network }))
      return null
    }
  },

  async ensExists(ensName: string, network: NetworksEnum): Promise<boolean> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const ensContract = new Contract(config.CONTRACTS.ENS_REGISTRY, ensRegistryABI, provider)

      const nameHashed = namehash(ensName)
      const recordExists = await ensContract.recordExists(nameHashed)

      return recordExists
    } catch (error) {
      logger.error('Error ensExists', llo({ ensName, network }))
      return false
    }
  },

  async queryLogs(filter: Filter, network: NetworksEnum): Promise<Log[]> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const logs = await provider.getLogs(filter)
      return logs
    } catch (error) {
      logger.error('Error querying logs', llo({ filter, network, error }))
      return []
    }
  },
}

export default Web3Utils
