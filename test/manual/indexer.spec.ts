import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Web3Helper from '@helpers/web3'
import ProviderModule from '@modules/provider'
import { Interface } from 'ethers'
import config from '@config'
import { ListEvents } from '../../migrations/seeds'
import { NetworksEnum } from '@types'
import IPFSModule from '@modules/ipfs'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoLogs } from '@services/indexer/daoLogs'
import { InitialData } from '../../initialData'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    config.BLOCKCHAIN_NODES.MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/'
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('index', async () => {
    await ProviderModule.connectToAllNetworks()
    await InitialData.start()
    await DaoLogs.start()
  })

  it('BlockchainLogCrawler', async () => {
    await ProviderModule.connectToAllNetworks()

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {
        // address: config.ARAGON_CONTRACTS.MAINNET['v1.3.0'].DAORegistryProxy.address,
        // topics: [daoRegisteredEvent.topic],
        fromBlock: 0, // Define starting block
        toBlock: 'latest', // Define ending block (can use block number or 'latest')
      },
      // batchSize: 10000000,  // Define the number of blocks to process at a time
      onLog: async (data: any) => {},
      onError: async (error: any) => {},
      stopOnError: false, // Set to true if you want to halt on error
    })

    await crawler.crawl()
  })

  it('logs DAOFactory', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.mainnet

    const daoRegisteredEvent = ListEvents.find(w => w.name === 'DAORegistered')!

    const filter = {
      address: config.ARAGON_CONTRACTS.MAINNET['v1.3.0'].DAOFactory.address,
      // topics: [daoRegisteredEvent.topic],
      fromBlock: 0, // 16721862
      toBlock: 'latest',
    }
    const txLogs = await Web3Helper.queryLogs(filter, network)

    const daoRegisterEvent = ListEvents.find(w => w.name === 'DAORegistered')!
    // const daoRegisterLogs = txLogs.filter(w => w.topics[0] === daoRegisterEvent.topic)

    for (let i = 0; i < txLogs.length; i++) {
      const txLog = txLogs[i]

      if (txLog?.topics?.length > 0 && daoRegisterEvent.topic === txLog.topics[0]) {
        const parsedTxLog = new Interface([daoRegisterEvent.params]).parseLog(txLog as any)

        if (parsedTxLog?.name !== daoRegisterEvent.name) {
          return
        }
      }
      const parsedTxLog = new Interface([daoRegisteredEvent.params]).parseLog(txLog as any)!
      console.log(parsedTxLog)
      console.log(parsedTxLog?.args.toObject())
      console.log(parsedTxLog?.args.versionTag.toObject())

      // const txDetails = await Web3Helper.getTransaction(txLog.transactionHash, network)
      const txReceipt = await Web3Helper.getTransactionReceipt(txLog.transactionHash, network)
      let metadata = Web3Helper.parseDaoMetadata({})
      let ipfsMetadataUrl: string | null = null

      let dao = {
        block: txLog.blockNumber,
        txHash: txLog.transactionHash,
        creatorAddress: parsedTxLog.args.creator,
        daoAddress: parsedTxLog.args.dao,
        ens: parsedTxLog.args.subdomain,
      }

      txReceipt?.logs.map(async txReceiptLog => {
        const event = ListEvents.find(w => w.topic === txReceiptLog.topics[0])

        if (event) {
          const parsedTxReceiptLog = new Interface([event.params]).parseLog(txReceiptLog as any)
          console.log(parsedTxReceiptLog)

          if (parsedTxReceiptLog?.name === 'MetadataSet') {
            const metadataBytes = Buffer.from(parsedTxReceiptLog.args.metadata.substring(2), 'hex')
            ipfsMetadataUrl = metadataBytes.toString('utf8')!
            const ipfsMetadata = await IPFSModule.fetchMetadata(ipfsMetadataUrl)
            metadata = Web3Helper.parseDaoMetadata(ipfsMetadata!)
            console.log(parsedTxReceiptLog.args.metadata)
          }
        } else {
          console.log('event not found', event)
        }
      })

      const dao1 = {
        name: metadata.name,
        avatar: metadata.avatar,
        links: metadata.links,
        block: txLog.blockNumber,
        creatorAddress: parsedTxLog.args.creator,
        daoAddress: parsedTxLog.args.dao,
        ens: parsedTxLog.args.subdomain,
        members: '',
        metadataIpfs: ipfsMetadataUrl,
        network,
        plugins: [], // plugin address (token base | multisig), version plugin,
        proposalsCreated: '',
        proposalsExecuted: '',
        tvlUSD: '',
        txHash: txLog.transactionHash,
        uniqueVoters: '', // unique voters is the count of distinct addresses that have voted
        votes: '', // total count of times anyone has voted,
        hideDao: '',
        createdAt: '',
      }

      console.log(parsedTxLog)
    }
  })

  it('logs DAORegistryProxy', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.mainnet

    const daoRegisteredEvent = ListEvents.find(w => w.name === 'DAORegistered')!

    const filter = {
      address: config.ARAGON_CONTRACTS.MAINNET['v1.3.0'].DAORegistryProxy.address,
      topics: [daoRegisteredEvent.topic],
      fromBlock: 0, // 16721862
      toBlock: 'latest',
    }
    const txLogs = await Web3Helper.queryLogs(filter, network)

    const daoRegisterEvent = ListEvents.find(w => w.name === 'DAORegistered')!
    // const daoRegisterLogs = txLogs.filter(w => w.topics[0] === daoRegisterEvent.topic)

    for (let i = 0; i < txLogs.length; i++) {
      const txLog = txLogs[i]

      if (txLog?.topics?.length > 0 && daoRegisterEvent.topic === txLog.topics[0]) {
        const parsedTxLog = new Interface([daoRegisterEvent.params]).parseLog(txLog as any)

        if (parsedTxLog?.name !== daoRegisterEvent.name) {
          return
        }
      }
      const parsedTxLog = new Interface([daoRegisteredEvent.params]).parseLog(txLog as any)!
      console.log(parsedTxLog)
      console.log(parsedTxLog?.args.toObject())
      console.log(parsedTxLog?.args.versionTag.toObject())

      // const txDetails = await Web3Helper.getTransaction(txLog.transactionHash, network)
      const txReceipt = await Web3Helper.getTransactionReceipt(txLog.transactionHash, network)
      let metadata = Web3Helper.parseDaoMetadata({})
      let ipfsMetadataUrl: string | null = null

      let dao = {
        block: txLog.blockNumber,
        txHash: txLog.transactionHash,
        creatorAddress: parsedTxLog.args.creator,
        daoAddress: parsedTxLog.args.dao,
        ens: parsedTxLog.args.subdomain,
      }

      txReceipt?.logs.map(async txReceiptLog => {
        const event = ListEvents.find(w => w.topic === txReceiptLog.topics[0])

        if (event) {
          const parsedTxReceiptLog = new Interface([event.params]).parseLog(txReceiptLog as any)
          console.log(parsedTxReceiptLog)

          if (parsedTxReceiptLog?.name === 'MetadataSet') {
            const metadataBytes = Buffer.from(parsedTxReceiptLog.args.metadata.substring(2), 'hex')
            ipfsMetadataUrl = metadataBytes.toString('utf8')!
            const ipfsMetadata = await IPFSModule.fetchMetadata(ipfsMetadataUrl)
            metadata = Web3Helper.parseDaoMetadata(ipfsMetadata!)
            console.log(parsedTxReceiptLog.args.metadata)
          }
        } else {
          console.log('event not found', event)
        }
      })

      const dao1 = {
        name: metadata.name,
        avatar: metadata.avatar,
        links: metadata.links,
        block: txLog.blockNumber,
        creatorAddress: parsedTxLog.args.creator,
        daoAddress: parsedTxLog.args.dao,
        ens: parsedTxLog.args.subdomain,
        members: '',
        metadataIpfs: ipfsMetadataUrl,
        network,
        plugins: '',
        proposalsCreated: '',
        proposalsExecuted: '',
        tvlUSD: '',
        txHash: txLog.transactionHash,
        uniqueVoters: '', // unique voters is the count of distinct addresses that have voted
        votes: '', // total count of times anyone has voted,
        hideDao: '',
        createdAt: '',
      }

      console.log(parsedTxLog)
    }
  })

  it('logs InstallationPrepared', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.mainnet

    const installationPreparedEvent = ListEvents.find(w => w.name === 'InstallationPrepared')!

    const filter = {
      address: config.ARAGON_CONTRACTS.MAINNET['v1.3.0'].PluginSetupProcessor.address,
      topics: [installationPreparedEvent.topic],
      fromBlock: 16721862, // 16721862
      toBlock: 'latest',
    }
    const txLogs = await Web3Helper.queryLogs(filter, network)

    for (let i = 0; i < txLogs.length; i++) {
      const txLog = txLogs[i]
      const parsedTxLog = new Interface([installationPreparedEvent.params]).parseLog(txLog as any)
      console.log(parsedTxLog)
      console.log(parsedTxLog?.args.toObject())
    }
  })
})
