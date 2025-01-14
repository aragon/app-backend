import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { ethers } from 'ethers'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const network = NetworksEnum.ethereumSepolia

    const ipfs = Web3Helper.extractMetadataUri(
      '0x697066733A2F2F516D587A777838567932796D723557427341523471706B61783534545050616E6E4D63426F554731586454324B31',
    )

    const data = await IPFSModule.fetchMetadata(ipfs!, { retries: 4 })

    console.log(data)
  },

  stop: async () => {},
}

export default ToolsManualTrigger
