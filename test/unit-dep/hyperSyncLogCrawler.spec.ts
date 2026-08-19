import { DAORegistry } from '@artifacts/daoRegistry'
import config from '@config'
import { Models } from '@dbModels'
import { HyperSyncLogCrawler } from '@modules/crawlers'
import { type IIndexerConfig, type ILogInfo, type LogServicePattern, NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress, Interface, type LogDescription } from 'ethers'

describe('Integ: HyperSyncLogCrawler', () => {
  const network = NetworksEnum.ethereumMainnet
  const DAO_REGISTRY = '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e'
  const REGISTRY_DEPLOY_BLOCK = 16721858
  const TO_BLOCK = 25789231

  const daoRegistryIface = new Interface(DAORegistry.abi)
  const DAO_REGISTERED_TOPIC = daoRegistryIface.getEvent('DAORegistered')!.topicHash

  type Collected = { parsedEvent: LogDescription; info: ILogInfo }

  /**
   * The real DAORegistered registry entry, with a collecting handler in place of
   * DaoRegistryHandler — the crawler is what is under test here, not the handler,
   * and we do not want a live crawl writing DAO rows as a side effect.
   */
  const eventsWith = (collected: Collected[]): IIndexerConfig[] => [
    {
      event: 'DAORegistered',
      enableHistorical: true,
      topic: DAO_REGISTERED_TOPIC,
      config: [
        {
          abi: DAORegistry.abi,
          handler: async (parsedEvent: LogDescription, info: ILogInfo) => {
            collected.push({ parsedEvent, info })
          },
        },
      ],
    },
  ]

  before(function () {
    if (!config.HYPERSYNC.API_TOKEN) {
      console.warn('Skipping: ENVIO_API_TOKEN is not set')
      this.skip()
    }
  })

  it('pulls real DAORegistered events off the mainnet registry and saves progress', async function () {
    this.timeout(300000)

    const collected: Collected[] = []
    const errors: Error[] = []
    const logService = 'test-hypersync-dao-registry' as LogServicePattern

    const crawler = new HyperSyncLogCrawler({
      network,
      address: DAO_REGISTRY,
      events: eventsWith(collected),
      fromBlock: REGISTRY_DEPLOY_BLOCK,
      toBlock: TO_BLOCK,
      logService,
      stopOnError: false,
      onError: (error: Error) => errors.push(error),
    })

    await crawler.crawl()

    expect(errors, `crawl errored: ${errors.map(e => e.message).join('; ')}`).to.have.length(0)
    expect(collected.length, 'no DAORegistered events found').to.be.greaterThan(0)

    // Every event decoded into the shape handlers expect.
    for (const { parsedEvent, info } of collected) {
      expect(parsedEvent.name).to.equal('DAORegistered')
      expect(getAddress(parsedEvent.args.dao)).to.equal(parsedEvent.args.dao)
      expect(parsedEvent.args.creator).to.be.a('string')
      expect(parsedEvent.args.subdomain).to.be.a('string')

      expect(info.network).to.equal(network)
      expect(info.eventName).to.equal('DAORegistered')
      expect(info.address).to.equal(DAO_REGISTRY)
      expect(info.blockNumber).to.be.within(REGISTRY_DEPLOY_BLOCK, TO_BLOCK - 1)
      expect(info.transactionHash).to.match(/^0x[0-9a-f]{64}$/i)
      expect(info.logIndex).to.be.a('number')
    }

    // Delivered in chain order, which handlers depend on.
    const ordered = collected.map(c => [c.info.blockNumber, c.info.logIndex] as const)
    for (let i = 1; i < ordered.length; i++) {
      const [prevBlock, prevIndex] = ordered[i - 1]
      const [block, index] = ordered[i]
      expect(block > prevBlock || (block === prevBlock && index > prevIndex), `out of order at ${i}`).to.equal(true)
    }

    const stats = crawler.getStats()
    expect(stats.nbSuccess).to.equal(collected.length)
    expect(stats.nbError).to.equal(0)
    expect(stats.batches).to.be.greaterThan(0)

    // lastSync is the first UNscanned block, so a bounded crawl lands exactly on toBlock.
    const progress = await Models.ConfigIndexer.findExistingLog({ network, service: logService })
    expect(progress, 'no progress row written').to.exist
    expect(progress!.lastSync).to.equal(TO_BLOCK)

    console.log('Total Daos', collected.length)
  })

  it('filters server-side on an indexed argument via positional topics', async function () {
    this.timeout(300000)

    // First pass: find a creator that registered more than one DAO in the window.
    const all: Collected[] = []
    await new HyperSyncLogCrawler({
      network,
      address: DAO_REGISTRY,
      events: eventsWith(all),
      fromBlock: REGISTRY_DEPLOY_BLOCK,
      toBlock: TO_BLOCK,
      stopOnError: false,
      onError: () => {},
    }).crawl()

    expect(all.length).to.be.greaterThan(0)

    const byCreator = new Map<string, Collected[]>()
    for (const c of all) {
      const creator = c.parsedEvent.args.creator as string
      byCreator.set(creator, [...(byCreator.get(creator) ?? []), c])
    }
    const [targetCreator, expected] = [...byCreator.entries()].sort((a, b) => b[1].length - a[1].length)[0]

    const filtered: Collected[] = []
    await new HyperSyncLogCrawler({
      network,
      events: eventsWith(filtered),
      fromBlock: REGISTRY_DEPLOY_BLOCK,
      toBlock: TO_BLOCK,
      logSelections: [
        {
          address: [DAO_REGISTRY],
          topics: [[DAO_REGISTERED_TOPIC], [], [HyperSyncLogCrawler.asTopic(targetCreator)]],
        },
      ],
      stopOnError: false,
      onError: () => {},
    }).crawl()

    expect(filtered.length).to.equal(expected.length)
    expect(filtered.length).to.be.lessThan(all.length) // the server really narrowed it
    for (const { parsedEvent } of filtered) {
      expect(parsedEvent.args.creator).to.equal(targetCreator)
    }
  })
})
