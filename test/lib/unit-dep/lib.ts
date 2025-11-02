import {
  EnumQueueName,
  HexAddress,
  type IIndexerConfig,
  IPluginInterfaceType,
  type IQueuePlugin,
  ITokenType,
  NetworksEnum,
} from '@types'
import Web3Helper from '@helpers/web3'
import { Interface, Log, type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import PluginRepoMockData from '@test/unit-dep/mockData/pluginRepo.json'
import ProviderModule from '@modules/provider'
import { ethers } from 'ethers'
import BottleneckModule from '@modules/bottleneck'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogAdmin } from '@plugins/logAdmin'
import { LogMultiSig } from '@plugins/logMultisig'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { LogSpp } from '@plugins/logSPP'
import { LogLockToVote } from '@plugins/logLockToVote'
import { LogGauge } from '@plugins/logGauge'

interface ILibParams {
  daoAddress: HexAddress
  network: NetworksEnum
  config?: {
    sandbox: SinonSandbox
    blockLimit?: number
  }
}

export class LibUtils {
  public daoAddress: HexAddress
  public network: NetworksEnum
  public sandbox: SinonSandbox
  public blockLimit: number
  public rabbitMQStub: any

  constructor({ daoAddress, network, config }: ILibParams) {
    this.daoAddress = daoAddress
    this.network = network
    this.sandbox = config?.sandbox!
    this.blockLimit = config?.blockLimit!
  }

  static async handleEventsFromTxHashes(txHashes: string[], network: NetworksEnum) {
    const receipts = await Promise.all(
      txHashes.map(async (txHash: string) => {
        return await Web3Helper.getTransactionReceipt(txHash, network)
      }),
    )

    const parsedLogs = (
      await Promise.all(
        receipts.map(async receipt => {
          if (!receipt) {
            logger.warn('Transaction receipt not found', { receipt })
            return false
          }
          return await LibUtils.parseLogsByConfig(receipt.logs as any, network)
        }),
      )
    ).filter(Boolean)

    for (const parsedLog of parsedLogs) {
      for (const { event, handler, info } of parsedLog as any) {
        await handler(event, info)
      }
    }
  }

  static async getData(
    abi: any,
    eventName: string,
    txHash: string,
    network: NetworksEnum,
  ): Promise<{ event: any; logInfo: any }[]> {
    // this is coming as null in some cases, but txHash is valid
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
  }

  static async registerPluginRepos(network: NetworksEnum): Promise<void> {
    await Models.PluginRepo.insertMany(PluginRepoMockData[network])
  }

  static async parseLogsByConfig(logs: Log[], network: NetworksEnum): Promise<any> {
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
  }

  async stubToBlock(): Promise<void> {
    const stub = this.sandbox.stub(Web3Helper, 'getBlockNumber')
    stub.callsFake(async (blockNumber: any, network: NetworksEnum) => {
      if (blockNumber === 'latest') {
        return this.blockLimit
      }
      // Call the original method using wrappedMethod
      return (stub.wrappedMethod as any).call(Web3Helper, blockNumber, network)
    })
  }

  async stubRabbitmqSend() {
    this.rabbitMQStub = this.sandbox.stub(RabbitMQHelper, 'sendMessage')
    return this.rabbitMQStub.callsFake(async (queue: string, job: any) => {
      if (queue === EnumQueueName.plugins) {
        const { address, network, isHistorical } = job.params as IQueuePlugin

        const plugin = await Models.Plugin.findByAddress(address, network)
        if (!plugin?.interfaceType) {
          logger.error('PluginSyncService: plugin not found', { address, network })
          return
        }

        switch (plugin.interfaceType) {
          case IPluginInterfaceType.admin: {
            await LogAdmin.start(plugin)
            break
          }
          case IPluginInterfaceType.multisig: {
            await LogMultiSig.start(plugin)
            break
          }
          case IPluginInterfaceType.tokenVoting: {
            const token = await Models.Token.findOne({
              address: plugin.tokenAddress,
              network: plugin.network,
            })

            if ((token?.type === ITokenType.ERC20 || token?.type === ITokenType.escrowAdapter) && token.isGovernance) {
              logger.info('Sync plugin: token is ERC20')

              await LogTokenVoting.start(plugin, token, isHistorical)
            } else {
              logger.warn('Sync plugin: token not governance erc20')
            }
            break
          }
          case IPluginInterfaceType.spp: {
            await LogSpp.start(plugin)
            break
          }
          case IPluginInterfaceType.lockToVote: {
            await LogLockToVote.start(plugin)
            break
          }
          case IPluginInterfaceType.gauge: {
            await LogGauge.start(plugin, isHistorical)
            break
          }
          default:
            break
        }
      }
    })
  }

  async syncCompleteDao(fromBlock: number) {
    const pspAddress = {
      [NetworksEnum.ethereumSepolia]: '0xC24188a73dc09aA7C721f96Ad8857B469C01dC9f',
      [NetworksEnum.chilizMainnet]: '0xD39Fd78987000C1aa96209d76bec576F31DbC9bE',
      [NetworksEnum.baseMainnet]: '0x91a851E9Ed7F2c6d41b15F76e4a88f5A37067cC9',
    }

    // setup
    await LibUtils.registerPluginRepos(this.network)
    if (this.blockLimit && this.blockLimit > 0) {
      await this.stubToBlock()
    }
    await this.stubRabbitmqSend()

    const provider = ProviderModule.getAnyRpcProvider(this.network)
    const daoAddressFilter = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [this.daoAddress])
    const limiter = BottleneckModule.getNodeLimiter(this.network)

    const daoLogs = (await limiter.schedule(() =>
      provider.getLogs({
        address: this.daoAddress,
        fromBlock: fromBlock ?? 0,
        toBlock: this.blockLimit ?? 'latest',
        topics: [
          configIndexer
            .filter(config => config.event === 'Granted' || config.event === 'Revoked')
            .map(config => config.topic),
        ],
      }),
    )) as Log[]

    const pspLogs = (await limiter.schedule(() =>
      provider.getLogs({
        address: pspAddress[this.network],
        fromBlock: fromBlock ?? 0,
        toBlock: this.blockLimit ?? 'latest',
        topics: [
          configIndexer
            .filter(
              config =>
                config.event === 'InstallationPrepared' ||
                config.event === 'UninstallationPrepared' ||
                config.event === 'UpdatePrepared',
            )
            .map(config => config.topic),
          null,
          [daoAddressFilter],
        ],
      }),
    )) as Log[]

    const allLogs = [...daoLogs, ...pspLogs].sort((a, b) => a.blockNumber - b.blockNumber)

    const txHashesUnique: any[] = Array.from(new Set(allLogs.map((log: any) => log.transactionHash)))

    const receipts = await Promise.all(
      txHashesUnique.map(async (txHash: string) => {
        return await Web3Helper.getTransactionReceipt(txHash, this.network)
      }),
    )

    const parsedLogs = (
      await Promise.all(
        receipts.map(async receipt => {
          if (!receipt) {
            logger.warn('Transaction receipt not found', { receipt })
            return false
          }
          return await LibUtils.parseLogsByConfig(receipt.logs as any, this.network)
        }),
      )
    ).filter(Boolean)

    for (const parsedLog of parsedLogs) {
      for (const { event, handler, info } of parsedLog as any) {
        await handler(event, info)
      }
    }
  }
}
