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

// ---------------------------------------------------------------------------
// VeBatchProcessor
// ---------------------------------------------------------------------------

export class VeBatchProcessor {
  private readonly network: NetworksEnum
  private readonly tickCtx: TickContext
  private events: VeEvent[] = []

  constructor(network: NetworksEnum, tickCtx: TickContext) {
    this.network = network
    this.tickCtx = tickCtx
  }

  // -- Setup ----------------------------------------------------------------

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
      const map = ESCROW_EVENTS.has(e.eventName)
        ? maps.escrowMap
        : EXIT_QUEUE_EVENTS.has(e.eventName)
          ? maps.exitQueueMap
          : maps.tokenMap
      const plugins = map.get(e.info.address)
      if (!plugins?.length) return false
      e.plugins = plugins
      return true
    })

    return this
  }

  async createMembers(): Promise<this> {
    const members = new Set<string>()
    for (const { eventName, parsed } of this.events) {
      const addr = parsed.args.depositor || parsed.args.sender || parsed.args._sender || parsed.args.holder
      if (addr) members.add(addr)
      if (eventName === 'TokensDelegated') members.add(parsed.args.delegatee)
    }
    if (members.size === 0) return this

    const maxBlock = Math.max(...this.events.map(e => e.info.blockNumber))
    const ops = [...members].map(addr => {
      const address = ethers.getAddress(addr)
      return {
        updateOne: {
          filter: { id: address },
          update: {
            $setOnInsert: { id: address, address, firstActivity: maxBlock },
            $max: { lastActivity: maxBlock },
          },
          upsert: true,
        },
      }
    })
    await this.chunkedBulkWrite(Models.Member, ops)
    return this
  }

  // -- Bulk Operations ------------------------------------------------------

  async processDeposits(): Promise<void> {
    const events = this.byEvent('Deposit')
    if (events.length === 0) return

    const delegationByTx = this.buildDelegationLookup()
    const lockOps: any[] = []
    const delegateOps: any[] = []

    for (const { parsed, info, plugins } of events) {
      const member = parsed.args.depositor
      const tokenId = parsed.args.tokenId.toString()
      const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow!
      const tokenAddress = plugins[0].tokenAddress
      const id = `${info.network}-${info.transactionHash}-${info.transactionIndex}-${info.logIndex}-${tokenAddress}-${info.address}-${member}-${tokenId}`

      lockOps.push({
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
      })

      const delegatee = delegationByTx.get(info.transactionHash)?.get(tokenId)
      if (delegatee) {
        delegateOps.push({
          updateOne: {
            filter: { network: info.network, tokenAddress, tokenId },
            update: { $set: { delegateReceiverAddress: delegatee } },
          },
        })
      }
    }

    await this.chunkedBulkWrite(Models.Lock, lockOps)
    if (delegateOps.length > 0) await this.chunkedBulkWrite(Models.Lock, delegateOps)
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

    // Pre-fetch all block timestamps in parallel
    const blockNumbers = [...new Set(events.map(e => e.info.blockNumber))]
    const timestamps = new Map<number, number>()
    await Promise.all(blockNumbers.map(async bn => timestamps.set(bn, await this.tickCtx.getBlockTimestamp(bn))))

    const delegationOps: any[] = []
    const lockOps: any[] = []
    const isDelegating = action === 'delegate'

    for (const { parsed, info } of events) {
      const from = parsed.args.sender
      const to = parsed.args.delegatee
      const tokenIds = parsed.args.tokenIds.map((id: any) => id.toString())
      const id = `${info.network}-${info.transactionHash}-${info.transactionIndex}-${info.logIndex}`

      delegationOps.push({
        updateOne: {
          filter: { id },
          update: {
            $setOnInsert: {
              id,
              network: info.network,
              contractAddress: info.address,
              delegator: from,
              delegate: to,
              tokenIds,
              action,
              blockNumber: info.blockNumber,
              blockTimestamp: timestamps.get(info.blockNumber),
              transactionHash: info.transactionHash,
              transactionIndex: info.transactionIndex,
              logIndex: info.logIndex,
            },
          },
          upsert: true,
        },
      })

      lockOps.push({
        updateMany: {
          filter: { network: info.network, tokenAddress: info.address, tokenId: { $in: tokenIds } },
          update: { $set: { delegateReceiverAddress: isDelegating ? to : null } },
        },
      })
    }

    await this.chunkedBulkWrite(Models.TokenDelegation, delegationOps)
    if (lockOps.length > 0) await this.chunkedBulkWrite(Models.Lock, lockOps)
  }

  async processSplits(): Promise<void> {
    for (const { parsed, info, plugins } of this.byEvent('Split')) {
      const sender = parsed.args._sender
      const fromTokenId = parsed.args._from.toString()
      const newTokenId = parsed.args.newTokenId.toString()
      const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow!

      const original = await Models.Lock.findOne({
        network: info.network,
        escrowAddress: info.address,
        tokenId: fromTokenId,
      })
      if (!original) {
        logger.warn('Lock not found for split', llo({ fromTokenId, info }))
        continue
      }

      const id = `${info.network}-${info.transactionHash}-${info.transactionIndex}-${info.logIndex}-${plugins[0].tokenAddress}-${info.address}-${sender}-${newTokenId}`

      await Models.Lock.bulkWrite(
        [
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
        ],
        { ordered: true },
      )
    }
  }

  async processMerges(): Promise<void> {
    const events = this.byEvent('Merged')
    if (events.length === 0) return

    // Batch fetch all fromLock amounts in one query
    const fromTokenIds = events.map(e => e.parsed.args._from.toString())
    const fromLocks = await Models.Lock.find({
      network: this.network,
      tokenId: { $in: fromTokenIds },
    }).lean()
    const lockAmountMap = new Map<string, string>()
    for (const lock of fromLocks) lockAmountMap.set(lock.tokenId, lock.amount)

    const ops: any[] = []
    for (const { parsed, info } of events) {
      const sender = parsed.args._sender
      const fromTokenId = parsed.args._from.toString()
      const toTokenId = parsed.args._to.toString()
      const fromAmount = lockAmountMap.get(fromTokenId)

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

  async processMetrics(): Promise<void> {
    // Collect unique member:plugin pairs with their max blockNumber
    const metricsMap = new Map<string, { member: string; plugin: Plugin; blockNumber: number }>()

    for (const { parsed, info, plugins, eventName } of this.events) {
      const addMetric = (member: string) => {
        const addr = ethers.getAddress(member)
        for (const plugin of plugins) {
          const key = `${addr}:${plugin.address}`
          const existing = metricsMap.get(key)
          if (!existing || info.blockNumber > existing.blockNumber) {
            metricsMap.set(key, { member: addr, plugin, blockNumber: info.blockNumber })
          }
        }
      }

      const member = parsed.args.depositor || parsed.args._sender || parsed.args.sender || parsed.args.holder
      if (member) addMetric(member)
      if (eventName === 'TokensDelegated' && parsed.args.sender !== parsed.args.delegatee) {
        addMetric(parsed.args.delegatee)
      }
    }

    if (metricsMap.size === 0) return

    // Bulk upsert PluginMetrics — no proposal/vote counting needed for VE events
    const ops = [...metricsMap.values()].map(({ member, plugin, blockNumber }) => {
      const id = `${this.network}-${member}-${plugin.address}`
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
            },
            $max: { lastActivity: blockNumber },
          },
          upsert: true,
        },
      }
    })

    await this.chunkedBulkWrite(Models.PluginMetrics, ops)
  }

  // -- Helpers --------------------------------------------------------------

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

  private buildDelegationLookup(): Map<string, Map<string, string>> {
    const lookup = new Map<string, Map<string, string>>()
    for (const e of this.byEvent('TokensDelegated')) {
      const tokenIds = e.parsed.args.tokenIds.map((id: any) => id.toString())
      if (!lookup.has(e.info.transactionHash)) lookup.set(e.info.transactionHash, new Map())
      const txMap = lookup.get(e.info.transactionHash)!
      for (const tid of tokenIds) txMap.set(tid, e.parsed.args.delegatee)
    }
    return lookup
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
        extraParams: { escrowAdapterAddress: info.address },
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

// ---------------------------------------------------------------------------
// Public API (used by PoolingCrawler)
// ---------------------------------------------------------------------------

export const GovernanceVeBatchHandler = {
  async processVeEventsBatch(logs: Log[], network: NetworksEnum): Promise<void> {
    if (logs.length === 0) return

    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.index - b.index)

    const tickCtx = new TickContext(network, logs)
    await tickCtx.init()

    try {
      const startTime = Date.now()
      const processor = new VeBatchProcessor(network, tickCtx)

      processor.parseLogs(logs)
      await processor.resolvePlugins()
      await processor.createMembers()

      // Order matters: deposit creates locks, delegation references them,
      // split/merge mutate them, exit/withdraw finalize them
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
        llo({ network, total: logs.length, duration: `${Date.now() - startTime}ms`, timings }),
      )
    } finally {
      tickCtx.clear()
    }
  },
}
