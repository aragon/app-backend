import { type IIndexerConfig, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { Interface, Log, type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import Web3Utils from '@helpers/web3Utils'

const UnitDepUtils = {
  getData: async (
    abi: any,
    eventName: string,
    txHash: string,
    network: NetworksEnum,
  ): Promise<{ event: any; logInfo: any }[]> => {
    const txReceipt = await Web3Helper.getTransactionReceipt(txHash, network)

    const eventLogs = Web3Utils.findLogsByName(txReceipt!, eventName, abi)

    const data: any = []
    for (const log of eventLogs) {
      const logInfo = Web3Utils.parseInfoLog(log.txLog, eventName, network)
      const iFace = new Interface(abi)
      const event = Web3Utils.parseLog(log.txLog, iFace)!
      data.push({ event, logInfo })
    }

    return data
  },

  registerPluginRepos: async () => {
    const repos = [
      {
        id: 'ethereum-sepolia-0xc9eec74e6c05b9ae7ec4b30322d11e3328056d494fc98fd8ee0b32d29e15ad96-98-195',
        transactionHash: '0xc9eec74e6c05b9ae7ec4b30322d11e3328056d494fc98fd8ee0b32d29e15ad96',
        transactionIndex: 98,
        logIndex: 195,
        blockNumber: 6421862,
        blockTimestamp: 1722591012,
        network: 'ethereum-sepolia',
        subdomain: 'spp',
        pluginRepo: '0xE67b8E026d190876704292442A38163Ce6945d6b',
      },
      {
        id: 'ethereum-sepolia-0xdd388d8f9c36f6333b6cee60e84060866003c5ce31d78c7c0ca491ab2d63c535-38-71',
        transactionHash: '0xdd388d8f9c36f6333b6cee60e84060866003c5ce31d78c7c0ca491ab2d63c535',
        transactionIndex: 38,
        logIndex: 71,
        blockNumber: 6416894,
        blockTimestamp: 1722523956,
        network: 'ethereum-sepolia',
        subdomain: 'multisig',
        pluginRepo: '0xA0901B5BC6e04F14a9D0d094653E047644586DdE',
      },
      {
        id: 'ethereum-sepolia-0x87effd11cc369ac0ad0565e8f8d1a57e2360994ffd7e7e773f62543c0569eaa6-95-229',
        transactionHash: '0x87effd11cc369ac0ad0565e8f8d1a57e2360994ffd7e7e773f62543c0569eaa6',
        transactionIndex: 95,
        logIndex: 229,
        blockNumber: 6418714,
        blockTimestamp: 1722548352,
        network: 'ethereum-sepolia',
        subdomain: 'admin',
        pluginRepo: '0xEdA3074437375DC71007AFC9D421644656d72287',
      },
      {
        id: 'ethereum-sepolia-0xa70ed21d5440e3109b2a36f356b53995b58469ce9506eeca118f324bc6f4efc5-30-128',
        transactionHash: '0xa70ed21d5440e3109b2a36f356b53995b58469ce9506eeca118f324bc6f4efc5',
        transactionIndex: 30,
        logIndex: 128,
        blockNumber: 6418853,
        blockTimestamp: 1722550200,
        network: 'ethereum-sepolia',
        subdomain: 'token-voting',
        pluginRepo: '0x6241ad0D3f162028d2e0000f1A878DBc4F5c4aD0',
      },
    ]

    await Promise.all(repos.map(async repo => await Models.PluginRepo.create(repo)))
  },

  parseLogsByConfig: async (logs: Log[], network: NetworksEnum) => {
    const parsedLogs: any = []
    for (const log of logs) {
      const eventSetting: IIndexerConfig | undefined = configIndexer.find(item => {
        if (typeof item.topic === 'string') {
          return item.topic === log.topics[0]
        }
        if (Array.isArray(item.topic)) {
          return item.topic.includes(log.topics[0])
        }
        return false
      })

      if (!eventSetting) {
        continue
      }

      let parsedEvent: LogDescription | null = null
      let matchingHandler: any = null

      for (const configItem of eventSetting?.config!) {
        const iFace = new Interface(configItem.abi)
        try {
          parsedEvent = Web3Utils.parseLog(log, iFace)
          if (parsedEvent) {
            matchingHandler = configItem.handler
            break
          }
        } catch (_) {
          // skip
        }
      }

      if (parsedEvent) {
        const info = Web3Utils.parseInfoLog(log, eventSetting!.event, network)
        parsedLogs.push({
          event: parsedEvent!,
          handler: matchingHandler,
          info,
        })
      }
    }

    return parsedLogs
  },
}

export default UnitDepUtils
