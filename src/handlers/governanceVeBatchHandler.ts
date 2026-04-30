import { ExitQueue } from '@artifacts/ExitQueue'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { Models } from '@dbModels'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { TickContext } from '@modules/crawlers/tickContext'
import { MemberGovernanceFactory } from '@src/governance'
import { type HexAddress, type ILogInfo, IPluginInterfaceType, ITokenType, type NetworksEnum } from '@types'
import { ethers, Interface, type Log, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceVeBatch' })

// ---------------------------------------------------------------------------
// Topic Registration
// ---------------------------------------------------------------------------

const veIncreasingInterface = new Interface(VotingEscrowIncreasing.abi)
const exitQueueInterface = new Interface(ExitQueue.abi)
const votingEscrowInterface = new Interface(VotingEscrow.abi)

const veTopicMap = new Map<string, { eventName: string; iface: Interface }>()

const registerTopics = (events: string[], iface: Interface) => {
  for (const eventName of events) {
    const topic = iface.getEvent(eventName)?.topicHash
    if (topic) veTopicMap.set(topic, { eventName, iface })
  }
}

registerTopics(['Deposit', 'Withdraw', 'Split', 'Merged'], veIncreasingInterface)
registerTopics(['ExitQueuedV2'], exitQueueInterface)
registerTopics(['TokensDelegated', 'TokensUndelegated'], votingEscrowInterface)

export const VE_TOPICS = new Set(veTopicMap.keys())

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ESCROW_EVENTS = new Set(['Deposit', 'Withdraw', 'Split', 'Merged'])
const EXIT_QUEUE_EVENTS = new Set(['ExitQueuedV2'])
const TOKEN_EVENTS = new Set(['TokensDelegated', 'TokensUndelegated'])

interface VeEvent {
  log: Log
  eventName: string
  parsed: LogDescription
  info: ILogInfo
  plugins: Plugin[]
}

interface PluginMaps {
  escrowMap: Map<string, Plugin[]>
  exitQueueMap: Map<string, Plugin[]>
  tokenMap: Map<string, Plugin[]>
}

export class VeBatchProcessor {
  private readonly network: NetworksEnum
  private readonly tickCtx: TickContext
  private readonly timestampCache: Map<number, number> = new Map()
  private events: VeEvent[] = []

  get eventCount(): number {
    return this.events.length
  }

  constructor(network: NetworksEnum, tickCtx: TickContext, timestampCache: Map<number, number>) {
    this.network = network
    this.tickCtx = tickCtx
    this.timestampCache = timestampCache
  }

  parseLogs(logs: Log[]): this {
    for (const log of logs) {
      const topicInfo = veTopicMap.get(log.topics[0])
      if (!topicInfo) continue
      try {
        const parsed = topicInfo.iface.parseLog({ topics: log.topics as string[], data: log.data })
        if (!parsed) continue
        this.events.push({
          log,
          eventName: topicInfo.eventName,
          parsed,
          plugins: [],
          info: {
            network: this.network,
            blockNumber: log.blockNumber,
            transactionIndex: log.transactionIndex,
            logIndex: log.index ?? (log as any).logIndex,
            transactionHash: log.transactionHash as HexAddress,
            address: ethers.getAddress(log.address) as HexAddress,
            eventName: topicInfo.eventName,
            context: this.tickCtx,
          },
        })
      } catch (_) {}
    }
    return this
  }

  async resolvePlugins(): Promise<this> {
    const maps = await this.fetchPluginMaps()

    this.events = this.events.filter(e => {
      const plugins = this.getPluginsForEvent(e.eventName, e.info.address, maps)
      if (!plugins?.length) return false
      e.plugins = plugins
      return true
    })

    return this
  }

  private getPluginsForEvent(eventName: string, address: string, maps: PluginMaps): Plugin[] | undefined {
    if (ESCROW_EVENTS.has(eventName)) return maps.escrowMap.get(address)
    if (EXIT_QUEUE_EVENTS.has(eventName)) return maps.exitQueueMap.get(address)
    return maps.tokenMap.get(address)
  }

  async createMembers(): Promise<this> {
    const members = new Map<string, number[]>()

    for (const { parsed, info } of this.events) {
      const addr = parsed.args.depositor || parsed.args.sender || parsed.args._sender || parsed.args.holder
      if (addr) {
        const address = ethers.getAddress(addr)
        if (!members.has(address)) members.set(address, [])
        members.get(address)!.push(info.blockNumber)
      }

      const delegatee = parsed.args.delegatee ?? parsed.args._delegatee
      if (delegatee && delegatee !== addr) {
        const delegateeAddr = ethers.getAddress(delegatee)
        if (!members.has(delegateeAddr)) members.set(delegateeAddr, [])
        members.get(delegateeAddr)!.push(info.blockNumber)
      }
    }

    if (members.size === 0) return this

    const ops = [...members.entries()].map(([address, blocks]) => ({
      updateOne: {
        filter: { id: address },
        update: {
          $setOnInsert: { id: address, address, firstActivity: blocks.reduce((a, b) => Math.min(a, b)) },
          $max: { lastActivity: blocks.reduce((a, b) => Math.max(a, b)) },
        },
        upsert: true,
      },
    }))
    await this.chunkedBulkWrite(Models.Member, ops)
    return this
  }

  async processDeposits(): Promise<void> {
    const events = this.byEvent('Deposit')
    if (events.length === 0) return

    const lockOps = events.map(({ parsed, info, plugins }) => {
      const member = parsed.args.depositor
      const tokenId = parsed.args.tokenId.toString()
      const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow!
      const tokenAddress = plugins[0].tokenAddress
      const id = Models.Lock.getEntityId({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        tokenAddress,
        escrowAddress: info.address,
        memberAddress: member,
        tokenId,
      })

      return {
        updateOne: {
          filter: { id },
          update: {
            $setOnInsert: {
              id,
              network: info.network,
              escrowAddress: info.address,
              transactionHash: info.transactionHash,
              transactionIndex: info.transactionIndex,
              logIndex: info.logIndex,
              blockNumber: info.blockNumber,
              blockTimestamp: this.timestampCache.get(info.blockNumber),
              memberAddress: member,
              nftAddress: nftLockAddress,
              tokenAddress,
              exitQueueAddress,
              tokenId,
              amount: parsed.args.value.toString(),
              epochStartAt: Number(parsed.args.startTs),
              totalLocked: parsed.args.newTotalLocked.toString(),
            },
          },
          upsert: true,
        },
      }
    })

    await this.chunkedBulkWrite(Models.Lock, lockOps)
  }

  async processWithdraws(): Promise<void> {
    const events = this.byEvent('Withdraw')
    if (events.length === 0) return

    const ops = events.map(({ parsed, info }) => ({
      updateOne: {
        filter: { escrowAddress: info.address, network: info.network, tokenId: parsed.args.tokenId.toString() },
        update: {
          $set: {
            memberAddress: parsed.args.depositor,
            delegateReceiverAddress: null,
            lockWithdraw: {
              status: true,
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
              totalLocked: parsed.args.newTotalLocked.toString(),
              amount: parsed.args.value.toString(),
              epochEndAt: Number(parsed.args.ts),
              blockTimestamp: this.timestampCache.get(info.blockNumber),
            },
          },
        },
      },
    }))

    await this.chunkedBulkWrite(Models.Lock, ops)
  }

  async processExitQueued(): Promise<void> {
    const events = this.byEvent('ExitQueuedV2')
    if (events.length === 0) return

    const ops = events.map(({ parsed, info }) => {
      const exitDateAt =
        parsed.args.exitDate || parsed.args.queuedAt ? Number(parsed.args.exitDate || parsed.args.queuedAt) : null
      return {
        updateOne: {
          filter: { exitQueueAddress: info.address, network: info.network, tokenId: parsed.args.tokenId.toString() },
          update: {
            $set: {
              memberAddress: parsed.args.holder,
              lockExit: {
                status: true,
                transactionHash: info.transactionHash,
                blockTimestamp: this.timestampCache.get(info.blockNumber),
                blockNumber: info.blockNumber,
                exitDateAt,
                holder: parsed.args.holder,
                tokenId: parsed.args.tokenId.toString(),
              },
            },
          },
        },
      }
    })

    await this.chunkedBulkWrite(Models.Lock, ops)
  }

  async processDelegations(action: 'delegate' | 'undelegate'): Promise<void> {
    const events = this.byEvent(action === 'delegate' ? 'TokensDelegated' : 'TokensUndelegated')
    if (events.length === 0) return
    const isDelegating = action === 'delegate'

    // 1. Create delegation log records
    const delegationOps = events.map(({ parsed, info }) => ({
      updateOne: {
        filter: {
          id: Models.TokenDelegation.getEntityId({
            network: info.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
          }),
        },
        update: {
          $setOnInsert: {
            id: Models.TokenDelegation.getEntityId({
              network: info.network,
              transactionHash: info.transactionHash,
              transactionIndex: info.transactionIndex,
              logIndex: info.logIndex,
            }),
            network: info.network,
            contractAddress: info.address,
            delegator: parsed.args.sender,
            delegate: parsed.args.delegatee,
            tokenIds: parsed.args.tokenIds.map((id: any) => id.toString()),
            action,
            blockNumber: info.blockNumber,
            blockTimestamp: this.timestampCache.get(info.blockNumber),
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
          },
        },
        upsert: true,
      },
    }))
    await this.chunkedBulkWrite(Models.TokenDelegation, delegationOps)

    // 2. Update lock delegation state
    const lockOps = events.map(({ parsed, info }) => ({
      updateMany: {
        filter: {
          network: info.network,
          tokenAddress: info.address,
          tokenId: { $in: parsed.args.tokenIds.map((id: any) => id.toString()) },
        },
        update: { $set: { delegateReceiverAddress: isDelegating ? parsed.args.delegatee : null } },
      },
    }))
    await this.chunkedBulkWrite(Models.Lock, lockOps)
  }

  async processSplits(): Promise<void> {
    const events = this.byEvent('Split')
    if (events.length === 0) return

    const fromTokenIds = events.map(e => e.parsed.args._from.toString())
    const escrowAddresses = [...new Set(events.map(e => e.info.address))]
    const fromLocks = await Models.Lock.find({
      network: this.network,
      escrowAddress: { $in: escrowAddresses },
      tokenId: { $in: fromTokenIds },
    }).lean()

    const lockMap = new Map<string, { epochStartAt: number }>()
    fromLocks.forEach((lock: any) =>
      lockMap.set(`${lock.escrowAddress}:${lock.tokenId}`, { epochStartAt: lock.epochStartAt }),
    )

    const ops: any[] = []
    for (const { parsed, info, plugins } of events) {
      const sender = parsed.args._sender
      const fromTokenId = parsed.args._from.toString()
      const newTokenId = parsed.args.newTokenId.toString()
      const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow!

      const original = lockMap.get(`${info.address}:${fromTokenId}`)
      if (!original) {
        logger.warn('Lock not found for split', llo({ fromTokenId, info }))
        continue
      }

      lockMap.set(`${info.address}:${newTokenId}`, { epochStartAt: original.epochStartAt })

      const id = Models.Lock.getEntityId({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        tokenAddress: plugins[0].tokenAddress,
        escrowAddress: info.address,
        memberAddress: sender,
        tokenId: newTokenId,
      })

      ops.push(
        {
          updateOne: {
            filter: { id },
            update: {
              $setOnInsert: {
                id,
                network: info.network,
                escrowAddress: info.address,
                transactionHash: info.transactionHash,
                transactionIndex: info.transactionIndex,
                logIndex: info.logIndex,
                blockNumber: info.blockNumber,
                memberAddress: sender,
                nftAddress: nftLockAddress,
                tokenAddress: plugins[0].tokenAddress,
                exitQueueAddress,
                tokenId: newTokenId,
                amount: parsed.args._splitAmount2.toString(),
                epochStartAt: original.epochStartAt,
                splitFromTokenId: fromTokenId,
              },
            },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { network: info.network, escrowAddress: info.address, tokenId: fromTokenId },
            update: { $set: { memberAddress: sender, amount: parsed.args._splitAmount1.toString() } },
          },
        },
      )
    }

    await this.chunkedBulkWrite(Models.Lock, ops)
  }

  async processMerges(): Promise<void> {
    const events = this.byEvent('Merged')
    if (events.length === 0) return

    const fromTokenIds = events.map(e => e.parsed.args._from.toString())
    const escrowAddresses = [...new Set(events.map(e => e.info.address))]
    const fromLocks = await Models.Lock.find({
      network: this.network,
      escrowAddress: { $in: escrowAddresses },
      tokenId: { $in: fromTokenIds },
    }).lean()
    const lockAmountMap = new Map<string, string>()
    for (const lock of fromLocks) lockAmountMap.set(`${lock.escrowAddress}:${lock.tokenId}`, lock.amount)

    const ops: any[] = []
    for (const { parsed, info } of events) {
      const sender = parsed.args._sender
      const fromTokenId = parsed.args._from.toString()
      const toTokenId = parsed.args._to.toString()
      const fromAmount = lockAmountMap.get(`${info.address}:${fromTokenId}`)

      if (!fromAmount) {
        logger.warn('Lock not found for merge', llo({ fromTokenId, info }))
        continue
      }

      ops.push(
        {
          updateOne: {
            filter: { network: info.network, escrowAddress: info.address, tokenId: fromTokenId },
            update: {
              $set: {
                memberAddress: sender,
                amount: '0',
                lockWithdraw: {
                  status: true,
                  transactionHash: info.transactionHash,
                  blockNumber: info.blockNumber,
                  blockTimestamp: this.timestampCache.get(info.blockNumber),
                  amount: fromAmount,
                },
              },
            },
          },
        },
        {
          updateOne: {
            filter: { network: info.network, escrowAddress: info.address, tokenId: toTokenId },
            update: { $set: { memberAddress: sender, amount: parsed.args._newTotalAmount.toString() } },
          },
        },
      )
    }

    await this.chunkedBulkWrite(Models.Lock, ops)
  }

  private recordBlockForMetrics(
    metricsMap: Map<string, { member: string; plugin: Plugin; firstBlock: number; lastBlock: number }>,
    addr: string,
    plugin: Plugin,
    blockNumber: number,
  ): void {
    const key = `${addr}:${plugin.address}`
    const existing = metricsMap.get(key)
    if (!existing) {
      metricsMap.set(key, { member: addr, plugin, firstBlock: blockNumber, lastBlock: blockNumber })
      return
    }
    if (blockNumber < existing.firstBlock) existing.firstBlock = blockNumber
    if (blockNumber > existing.lastBlock) existing.lastBlock = blockNumber
  }

  async processMetrics(): Promise<void> {
    const metricsMap = new Map<string, { member: string; plugin: Plugin; firstBlock: number; lastBlock: number }>()

    for (const { parsed, info, plugins } of this.events) {
      const member = parsed.args.depositor || parsed.args._sender || parsed.args.sender || parsed.args.holder
      if (!member) continue

      const addr = ethers.getAddress(member)
      for (const plugin of plugins) this.recordBlockForMetrics(metricsMap, addr, plugin, info.blockNumber)

      const delegateeRaw = parsed.args.delegatee ?? parsed.args._delegatee
      if (delegateeRaw && delegateeRaw !== member) {
        const delegateeAddr = ethers.getAddress(delegateeRaw)
        for (const plugin of plugins) this.recordBlockForMetrics(metricsMap, delegateeAddr, plugin, info.blockNumber)
      }
    }

    if (metricsMap.size === 0) return

    const ops = [...metricsMap.values()].map(({ member, plugin, firstBlock, lastBlock }) => {
      const id = Models.PluginMetrics.getEntityId({
        network: this.network,
        memberAddress: member,
        pluginAddress: plugin.address,
      })
      return {
        updateOne: {
          filter: { id },
          update: {
            $setOnInsert: {
              id,
              network: this.network,
              memberAddress: member,
              pluginAddress: plugin.address,
              daoAddress: plugin.daoAddress,
              proposalCount: 0,
              voteCount: 0,
              firstActivity: firstBlock,
            },
            $max: { lastActivity: lastBlock },
          },
          upsert: true,
        },
      }
    })

    await this.chunkedBulkWrite(Models.PluginMetrics, ops)
  }

  private static readonly BULK_CHUNK_SIZE = 500

  private async chunkedBulkWrite(model: any, ops: any[], ordered = false): Promise<void> {
    if (ops.length === 0) return
    if (ops.length <= VeBatchProcessor.BULK_CHUNK_SIZE) {
      await model.bulkWrite(ops, { ordered })
      return
    }
    for (let i = 0; i < ops.length; i += VeBatchProcessor.BULK_CHUNK_SIZE) {
      const chunk = ops.slice(i, i + VeBatchProcessor.BULK_CHUNK_SIZE)
      await model.bulkWrite(chunk, { ordered })
    }
  }

  private byEvent(...names: string[]): VeEvent[] {
    return this.events.filter(e => names.includes(e.eventName))
  }

  async updateDaoMetrics(): Promise<void> {
    const seen = new Set<string>()
    for (const { info, plugins } of this.events) {
      const escrow = plugins[0].votingEscrow?.escrowAddress
      if (!escrow || seen.has(escrow)) continue
      seen.add(escrow)
      const gov = MemberGovernanceFactory.create({
        address: escrow,
        network: info.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenType: ITokenType.escrowAdapter,
        extraParams: { escrowAdapterAddress: plugins[0].tokenAddress },
      })
      await gov.updateDaoMetrics()
    }
  }

  private async fetchPluginMaps(): Promise<PluginMaps> {
    const escrowAddrs = new Set<string>()
    const exitQueueAddrs = new Set<string>()
    const tokenAddrs = new Set<string>()

    for (const { eventName, info } of this.events) {
      if (ESCROW_EVENTS.has(eventName)) escrowAddrs.add(info.address)
      else if (EXIT_QUEUE_EVENTS.has(eventName)) exitQueueAddrs.add(info.address)
      else if (TOKEN_EVENTS.has(eventName)) tokenAddrs.add(info.address)
    }

    const [byEscrow, byExitQueue, byToken] = await Promise.all([
      escrowAddrs.size > 0
        ? Models.Plugin.find({ 'votingEscrow.escrowAddress': { $in: [...escrowAddrs] }, network: this.network }).lean()
        : [],
      exitQueueAddrs.size > 0
        ? Models.Plugin.find({
            'votingEscrow.exitQueueAddress': { $in: [...exitQueueAddrs] },
            network: this.network,
          }).lean()
        : [],
      tokenAddrs.size > 0
        ? Models.Plugin.find({
            tokenAddress: { $in: [...tokenAddrs] },
            network: this.network,
            interfaceType: { $in: [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.gauge] },
          }).lean()
        : [],
    ])

    const toMap = (items: any[], keyFn: (p: any) => string | undefined) => {
      const map = new Map<string, Plugin[]>()
      for (const p of items) {
        const key = keyFn(p)
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(p as Plugin)
      }
      return map
    }

    return {
      escrowMap: toMap(byEscrow, p => p.votingEscrow?.escrowAddress),
      exitQueueMap: toMap(byExitQueue, p => p.votingEscrow?.exitQueueAddress),
      tokenMap: toMap(byToken, p => p.tokenAddress),
    }
  }
}

export const GovernanceVeBatchHandler = {
  async processVeEventsBatch(logs: Log[], network: NetworksEnum): Promise<number> {
    if (logs.length === 0) return 0

    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.index - b.index)

    const tickCtx = new TickContext(network, logs)
    await tickCtx.init()

    const uniqueBlocks = [...new Set(logs.map(e => e.blockNumber))]
    const timestamps = await tickCtx.getBlockTimestamps(uniqueBlocks)

    try {
      const startTime = Date.now()
      const processor = new VeBatchProcessor(network, tickCtx, timestamps)

      processor.parseLogs(logs)
      await processor.resolvePlugins()

      const handledCount = processor.eventCount
      if (handledCount === 0) return 0

      await processor.createMembers()

      const timings: Record<string, number> = {}
      const time = async (name: string, fn: () => Promise<void>) => {
        const t = Date.now()
        await fn()
        timings[name] = Date.now() - t
      }

      await time('deposits', () => processor.processDeposits())
      await time('delegations', () => processor.processDelegations('delegate'))
      await time('undelegations', () => processor.processDelegations('undelegate'))
      await time('splits', () => processor.processSplits())
      await time('merges', () => processor.processMerges())
      await time('exitQueued', () => processor.processExitQueued())
      await time('withdraws', () => processor.processWithdraws())
      await time('metrics', () => processor.processMetrics())
      await time('daoMetrics', () => processor.updateDaoMetrics())

      logger.info(
        'VeBatch processed',
        llo({ network, total: logs.length, handled: handledCount, duration: `${Date.now() - startTime}ms`, timings }),
      )

      return handledCount
    } finally {
      tickCtx.clear()
    }
  },
}
