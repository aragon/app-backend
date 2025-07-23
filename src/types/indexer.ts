import { type IPluginInterfaceType } from '@src/types/plugin'
import type { HexAddress, NetworksEnum } from '@src/types/networks'

export enum IndexerType {
  indexer = 'indexer',
  deposit = 'deposit',
  withdraw = 'withdraw',
  dao = 'dao',
  plugin = 'plugin',
  token = 'token',
  permission = 'permission',
}

export interface IServiceName {
  indexerType: IndexerType
  interfaceType: IPluginInterfaceType
  network: NetworksEnum
  pluginAddress: HexAddress
  tokenAddress?: HexAddress
}
