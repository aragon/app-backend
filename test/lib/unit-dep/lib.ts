import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProviderModule from '@modules/provider'
import { type StubRabbitmqOptions, stubRabbitmqSend } from '@test/lib/stubs/rabbitmq'
import { UnitTestUtils } from '@test/lib/utils'
import PluginRepoMockData from '@test/unit-dep/mockData/pluginRepo.json'
import { HexAddress, IEventLogPolicyType, type IIndexerConfig, NetworksEnum } from '@types'
import { ethers, Interface, Log, type LogDescription } from 'ethers'
import { TickContext } from '@modules/crawlers/tickContext'
import { SinonSandbox } from 'sinon'

// Policy factory addresses per network
const POLICY_FACTORY_ADDRESSES: Partial<Record<NetworksEnum, string[]>> = {
  [NetworksEnum.ethereumSepolia]: [
    '0x1134703E2a6713c1bC43DF35A08d82A8A1e59b11', // RouterSourceFactory
    '0xcB3Ce8f3450BB65ebe5EAE0144ecE47814C1fA47', // OmniSourceFactory
    '0xEB9e27056cBfD6E1a22ee051a44787Cf2FBbe911', // ClaimerSourceFactory
    '0xDC092C9f4c5196De1ee7FeE3B8eea2A75a44f64d', // RouterModelFactory
    '0x2C52582d49D530e8C0973c07f5c2A3e688697E0C', // OmniModelFactory
  ],
}

interface ILibParams {
  daoAddress: HexAddress
  network: NetworksEnum
  config?: {
    sandbox: SinonSandbox
    blockLimit?: number
    processQueues?: StubRabbitmqOptions
  }
}

export class LibUtils {
  public daoAddress: HexAddress
  public network: NetworksEnum
  public sandbox: SinonSandbox
  public blockLimit: number
  public rabbitMQStub: any
  public processQueues?: StubRabbitmqOptions

  constructor({ daoAddress, network, config }: ILibParams) {
    this.daoAddress = daoAddress
    this.network = network
    this.sandbox = config?.sandbox!
    this.blockLimit = config?.blockLimit!
    this.processQueues = config?.processQueues
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
        info.context = new TickContext(network, parsedLog)
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
    if (PluginRepoMockData[network]) {
      await Models.PluginRepo.insertMany(PluginRepoMockData[network])
    }
  }

  /**
   * Sync factory deployment events to populate LogPolicy audit records
   * This must be run before syncing policy plugins so we have block numbers
   */
  static async syncFactoryEvents(network: NetworksEnum, fromBlock: number, toBlock?: number): Promise<void> {
    const factoryAddresses = POLICY_FACTORY_ADDRESSES[network]
    if (!factoryAddresses || factoryAddresses.length === 0) {
      logger.warn('No factory addresses configured for network', { network })
      return
    }

    logger.info('Starting factory events sync', { factoryAddresses, network, fromBlock })

    const factoryEventNames = Object.values(IEventLogPolicyType)
    const configFactoryLogs = configIndexer.filter((item: IIndexerConfig) =>
      factoryEventNames.includes(item.event as IEventLogPolicyType),
    )

    if (configFactoryLogs.length === 0) {
      logger.warn('No factory events found in configIndexer')
      return
    }

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: configFactoryLogs,
      address: factoryAddresses,
      fromBlock,
      toBlock,
      onError: async (error: any, log: any) => {
        logger.error('Error syncing factory events', { error, log })
      },
      stopOnError: true,
    })

    await crawler.crawl()
    await crawler.end()

    const logPolicyCount = await Models.LogPolicy.countDocuments({ network })
    logger.info('Factory events sync complete', { network, logPolicyCount })
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
    this.rabbitMQStub = stubRabbitmqSend(this.sandbox, this.processQueues)
    return this.rabbitMQStub
  }

  async syncCompleteDao(fromBlock: number, stopWhen?: () => Promise<boolean> | boolean) {
    const pspAddress = await UnitTestUtils.getPspAddressMap()

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
        if (stopWhen && (await stopWhen())) return
      }
    }
  }
}
