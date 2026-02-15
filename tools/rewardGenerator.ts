import { GaugeVoter } from '@artifacts/GaugeVoter'
import { LockERC721 } from '@artifacts/LockERC721'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import ProxyWeb3Provider from '@modules/proxyProvider'
import VeRewardDistribution from '@modules/veRewardDistribution'
import {
  type ActiveVoter,
  EnumConnection,
  GaugeLogs,
  type HexAddress,
  type IFormattedLog,
  type IService,
  IVotingEscrowAdapterLogs,
  NetworksEnum,
  type RewardDistributionResult,
  TokenTransfer,
} from '@types'
import * as fs from 'node:fs'
import * as path from 'node:path'

const llo = logger.logMeta.bind(null, { service: 'tool:rewardGenerator' })

// biome-ignore lint/suspicious/noConsole: CLI tool output
const print = (line: string) => console.log(line)

interface CrawledVotersResult {
  voters: ActiveVoter[]
  onChainTotal: bigint
  maxBlock: number
}

interface SerializedEvent {
  name: string
  source: 'plugin' | 'adapter' | 'lockNFT'
  address: string
  blockNumber: number
  logIndex: number
  transactionHash: string
  args: Record<string, string>
}

interface CrawledEventsFile {
  pluginAddress: string
  network: string
  epochId: number
  voteEnd: number
  epochStart: number
  hookEnabled: boolean
  addresses: {
    clock: string
    escrow: string
    adapter: string
    lockNFT: string
  }
  events: SerializedEvent[]
}

function serializeLog(log: IFormattedLog, source: 'plugin' | 'adapter' | 'lockNFT'): SerializedEvent {
  const args: Record<string, string> = {}
  for (const input of log.event.fragment.inputs) {
    const value = log.event.args[input.name]
    if (value === undefined) continue
    if (Array.isArray(value)) {
      args[input.name] = value.map(v => v.toString()).join(',')
    } else {
      args[input.name] = value.toString()
    }
  }
  return {
    name: log.event.name,
    source,
    address: log.info.address,
    blockNumber: log.info.blockNumber,
    logIndex: log.info.logIndex,
    transactionHash: log.info.transactionHash,
    args,
  }
}

async function crawlAndSaveEvents(params: {
  pluginAddress: HexAddress
  network: NetworksEnum
  epochId: number
}): Promise<string> {
  const { pluginAddress, network, epochId } = params

  const [clockAddress, escrowAddress] = await Promise.all([
    GovernanceVeHelper.getClockAddress(pluginAddress, network),
    GovernanceVeHelper.getEscrowAddress(pluginAddress, network),
  ])

  if (!clockAddress || !escrowAddress) throw new Error('Failed to resolve clock or escrow')

  const [lockNFTAddress, adapterAddress] = await Promise.all([
    GovernanceVeHelper.getNftLockAddress(escrowAddress, network),
    GaugeHelper.getIVotesAdapterAddress(escrowAddress, network),
  ])

  if (!lockNFTAddress || !adapterAddress) throw new Error('Failed to resolve lockNFT or adapter')

  const hookEnabled = await GaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)
  const votingPeriod = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)
  if (!votingPeriod) throw new Error('Failed to resolve voting period')

  const [pluginDeployBlock, adapterDeployBlock, nftDeployBlock] = await Promise.all([
    ProxyWeb3Provider.fetchContractCreation({ address: pluginAddress, network }),
    ProxyWeb3Provider.fetchContractCreation({ address: adapterAddress, network }),
    ProxyWeb3Provider.fetchContractCreation({ address: lockNFTAddress, network }),
  ])

  const voteEndBlock = await Web3Helper.findBlockAtTimestamp(votingPeriod.voteEnd, network)

  print(`  Crawling Vote/Reset events from plugin...`)
  const voteResetLogs = await Web3Helper.crawlEvents(
    pluginAddress,
    network,
    [GaugeLogs.Voted, GaugeLogs.Reset],
    GaugeVoter.abi,
    pluginDeployBlock.blockNumber,
    voteEndBlock,
  )

  const maxBlock = voteResetLogs.length > 0 ? Math.max(...voteResetLogs.map(l => l.info.blockNumber)) : voteEndBlock

  print(`  Crawling delegation events from adapter...`)
  const delegationLogs = await Web3Helper.crawlEvents(
    adapterAddress,
    network,
    [IVotingEscrowAdapterLogs.TokensDelegated, IVotingEscrowAdapterLogs.TokensUndelegated],
    VotingEscrow.abi,
    adapterDeployBlock.blockNumber,
    maxBlock,
  )

  print(`  Crawling Transfer events from lockNFT...`)
  const transferLogs = await Web3Helper.crawlEvents(
    lockNFTAddress,
    network,
    [TokenTransfer.Transfer],
    LockERC721.abi,
    nftDeployBlock.blockNumber,
    maxBlock,
  )

  const allEvents: SerializedEvent[] = [
    ...voteResetLogs.map(l => serializeLog(l, 'plugin')),
    ...delegationLogs.map(l => serializeLog(l, 'adapter')),
    ...transferLogs.map(l => serializeLog(l, 'lockNFT')),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)

  const fileData: CrawledEventsFile = {
    pluginAddress,
    network,
    epochId,
    voteEnd: votingPeriod.voteEnd,
    epochStart: votingPeriod.epochStart,
    hookEnabled,
    addresses: {
      clock: clockAddress,
      escrow: escrowAddress,
      adapter: adapterAddress,
      lockNFT: lockNFTAddress,
    },
    events: allEvents,
  }

  const outDir = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const filePath = path.join(outDir, `events-${pluginAddress.slice(0, 8)}-epoch${epochId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2))

  print(`  Saved ${allEvents.length} events to ${filePath}`)
  print(`    Vote/Reset: ${voteResetLogs.length}`)
  print(`    Delegation: ${delegationLogs.length}`)
  print(`    Transfer:   ${transferLogs.length}`)

  return filePath
}

function buildActiveVotersFromFile(events: SerializedEvent[]): CrawledVotersResult {
  const voteResetEvents = events.filter(
    e => e.source === 'plugin' && (e.name === GaugeLogs.Voted || e.name === GaugeLogs.Reset),
  )

  if (voteResetEvents.length === 0) {
    return { voters: [], onChainTotal: 0n, maxBlock: 0 }
  }

  // Find each voter's latest tx
  const voterLatestTx = new Map<string, { txHash: string; block: number; timestamp: number }>()
  for (const evt of voteResetEvents) {
    const voter = evt.args.voter
    const existing = voterLatestTx.get(voter)
    if (
      !existing ||
      evt.blockNumber > existing.block ||
      (evt.blockNumber === existing.block && Number(evt.args.timestamp) > existing.timestamp)
    ) {
      voterLatestTx.set(voter, {
        txHash: evt.transactionHash,
        block: evt.blockNumber,
        timestamp: Number(evt.args.timestamp),
      })
    }
  }

  // For each voter's latest tx, sum per-gauge VP
  const voters: ActiveVoter[] = []
  for (const [voter, { txHash, block, timestamp }] of voterLatestTx) {
    const txEvents = voteResetEvents.filter(e => e.args.voter === voter && e.transactionHash === txHash)

    const gaugeVP = new Map<string, bigint>()
    for (const evt of txEvents) {
      const gauge = evt.args.gauge
      if (evt.name === GaugeLogs.Voted) {
        gaugeVP.set(gauge, BigInt(evt.args.votingPowerCastForGauge))
      } else {
        gaugeVP.set(gauge, 0n)
      }
    }

    let totalVP = 0n
    for (const vp of gaugeVP.values()) totalVP += vp

    if (totalVP > 0n) {
      voters.push({ voter, usedVP: totalVP, latestTxHash: txHash, latestBlock: block, latestBlockTimestamp: timestamp })
    }
  }

  const lastEvent = voteResetEvents[voteResetEvents.length - 1]
  const onChainTotal = BigInt(lastEvent.args.totalVotingPowerInContract)
  const maxBlock = voters.length > 0 ? Math.max(...voters.map(v => v.latestBlock)) : 0

  voters.sort((a, b) => b.latestBlock - a.latestBlock)

  return { voters, onChainTotal, maxBlock }
}

function buildDelegationMapFromFile(
  events: SerializedEvent[],
  activeVoters: ActiveVoter[],
  hookEnabled: boolean,
  epochStart: number,
): { delegationMap: Map<string, Map<string, string[]>>; votersByBlock: Map<number, ActiveVoter[]> } {
  const delegationEvents = events.filter(e => e.source === 'adapter' || e.source === 'lockNFT')

  // Build voter checkpoints
  const votersByBlock = new Map<number, ActiveVoter[]>()
  if (!hookEnabled) {
    // All voters at epoch start block — we don't have the block here, use lowest voter block as proxy
    const minBlock = activeVoters.length > 0 ? Math.min(...activeVoters.map(v => v.latestBlock)) : 0
    votersByBlock.set(minBlock, activeVoters)
  } else {
    for (const voter of activeVoters) {
      if (!votersByBlock.has(voter.latestBlock)) votersByBlock.set(voter.latestBlock, [])
      votersByBlock.get(voter.latestBlock)!.push(voter)
    }
  }

  const checkpointBlocks = [...votersByBlock.keys()].sort((a, b) => a - b)
  const ownershipMap = new Map<string, string>()
  const tokenDelegation = new Map<string, string>()
  const delegationMap = new Map<string, Map<string, string[]>>()

  let logIdx = 0
  for (const block of checkpointBlocks) {
    // Replay events up to this block
    while (logIdx < delegationEvents.length && delegationEvents[logIdx].blockNumber <= block) {
      const evt = delegationEvents[logIdx]

      if (evt.name === TokenTransfer.Transfer) {
        const from = evt.args.from
        const to = evt.args.to
        const tokenId = evt.args.tokenId

        if (to === '0x0000000000000000000000000000000000000000') {
          ownershipMap.delete(tokenId)
          tokenDelegation.delete(tokenId)
        } else {
          ownershipMap.set(tokenId, to)
          if (from !== '0x0000000000000000000000000000000000000000' && to !== from) {
            tokenDelegation.delete(tokenId)
          }
        }
      } else if (evt.name === IVotingEscrowAdapterLogs.TokensDelegated) {
        const delegatee = evt.args.delegatee
        const tokenIds = evt.args.tokenIds.split(',')
        for (const tid of tokenIds) {
          tokenDelegation.set(tid, delegatee)
        }
      } else if (evt.name === IVotingEscrowAdapterLogs.TokensUndelegated) {
        const tokenIds = evt.args.tokenIds.split(',')
        for (const tid of tokenIds) {
          tokenDelegation.delete(tid)
        }
      }

      logIdx++
    }

    // Snapshot delegations for voters at this block
    for (const voter of votersByBlock.get(block)!) {
      const ownerTokensMap = new Map<string, string[]>()
      for (const [tokenId, delegatee] of tokenDelegation) {
        if (delegatee === voter.voter) {
          const owner = ownershipMap.get(tokenId)
          if (owner) {
            if (!ownerTokensMap.has(owner)) ownerTokensMap.set(owner, [])
            ownerTokensMap.get(owner)!.push(tokenId)
          }
        }
      }
      delegationMap.set(voter.voter, ownerTokensMap)
    }
  }

  return { delegationMap, votersByBlock }
}

function printCrawledVoters(label: string, votersResult: CrawledVotersResult) {
  const sep = '─'.repeat(80)
  print('')
  print(sep)
  print(
    `  ${label} ACTIVE VOTERS (${votersResult.voters.length})  onChainTotal=${votersResult.onChainTotal.toString()}`,
  )
  print(sep)
  print(`  ${'#'.padEnd(4)} ${'Voter'.padEnd(44)} ${'Used VP'.padStart(24)}  ${'Block'.padStart(10)}`)
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(24)}  ${'─'.repeat(10)}`)
  votersResult.voters
    .sort((a, b) => (b.usedVP > a.usedVP ? 1 : b.usedVP < a.usedVP ? -1 : 0))
    .forEach((v, i) => {
      print(
        `  ${String(i + 1).padEnd(4)} ${v.voter.padEnd(44)} ${v.usedVP.toString().padStart(24)}  ${String(v.latestBlock).padStart(10)}`,
      )
    })
}

function printDelegationMap(label: string, delegationMap: Map<string, Map<string, string[]>>) {
  const sep = '─'.repeat(80)
  let count = 0
  for (const [, ownerMap] of delegationMap) count += ownerMap.size

  print('')
  print(sep)
  print(`  ${label} DELEGATION MAP (${count} entries)`)
  print(sep)
  print(`  ${'Voter'.padEnd(44)} ${'Owner'.padEnd(44)} ${'Tokens'}`)
  print(`  ${'─'.repeat(44)} ${'─'.repeat(44)} ${'─'.repeat(20)}`)
  for (const [voter, ownerMap] of delegationMap) {
    for (const [owner, tokenIds] of ownerMap) {
      print(`  ${voter.padEnd(44)} ${owner.padEnd(44)} ${tokenIds.join(',')}`)
    }
  }
}

function validateResults(
  dbResult: RewardDistributionResult,
  crawledVoters: CrawledVotersResult,
  crawledDelegationMap: Map<string, Map<string, string[]>>,
) {
  const sep = '─'.repeat(80)
  print('')
  print('╔══════════════════════════════════════════════════════════════════════════════╗')
  print('║                          VALIDATION COMPARISON                              ║')
  print('╚══════════════════════════════════════════════════════════════════════════════╝')

  // Compare voters
  print('')
  print(sep)
  print('  VOTERS COMPARISON')
  print(sep)

  const dbVoterMap = new Map(dbResult.voters.map(v => [v.voter, v.usedVP]))
  const crawledVoterMap = new Map(crawledVoters.voters.map(v => [v.voter, v.usedVP]))

  const allVoters = new Set([...dbVoterMap.keys(), ...crawledVoterMap.keys()])
  let voterMismatch = false
  for (const voter of allVoters) {
    const dbVP = dbVoterMap.get(voter)
    const crawledVP = crawledVoterMap.get(voter)
    if (dbVP === undefined) {
      print(`  EXTRA IN CRAWL: ${voter}  VP=${crawledVP?.toString()}`)
      voterMismatch = true
    } else if (crawledVP === undefined) {
      print(`  MISSING IN CRAWL: ${voter}  VP=${dbVP.toString()}`)
      voterMismatch = true
    } else if (dbVP !== crawledVP) {
      print(`  VP MISMATCH: ${voter}  db=${dbVP.toString()}  crawled=${crawledVP.toString()}`)
      voterMismatch = true
    }
  }
  if (!voterMismatch) print(`  ALL ${allVoters.size} VOTERS MATCH`)

  // Compare onChainTotal
  print('')
  const totalMatch = dbResult.contractTotal === crawledVoters.onChainTotal
  print(
    `  onChainTotal: db=${dbResult.contractTotal.toString()}  crawled=${crawledVoters.onChainTotal.toString()}  ${totalMatch ? 'MATCH' : 'MISMATCH'}`,
  )

  // Compare delegation map
  print('')
  print(sep)
  print('  DELEGATION COMPARISON')
  print(sep)

  const dbDelegationMap = new Map<string, Map<string, string[]>>()
  for (const d of dbResult.delegations) {
    if (!dbDelegationMap.has(d.voter)) dbDelegationMap.set(d.voter, new Map())
    dbDelegationMap.get(d.voter)!.set(d.owner, d.tokenIds.sort())
  }

  let delegationMismatch = false
  const allDelegationVoters = new Set([...dbDelegationMap.keys(), ...crawledDelegationMap.keys()])
  for (const voter of allDelegationVoters) {
    const dbOwnerMap = dbDelegationMap.get(voter)
    const crawledOwnerMap = crawledDelegationMap.get(voter)

    if (!dbOwnerMap && crawledOwnerMap) {
      print(`  EXTRA VOTER IN CRAWL: ${voter}`)
      delegationMismatch = true
      continue
    }
    if (dbOwnerMap && !crawledOwnerMap) {
      print(`  MISSING VOTER IN CRAWL: ${voter}`)
      delegationMismatch = true
      continue
    }
    if (!dbOwnerMap || !crawledOwnerMap) continue

    const allOwners = new Set([...dbOwnerMap.keys(), ...crawledOwnerMap.keys()])
    for (const owner of allOwners) {
      const dbTokens = dbOwnerMap.get(owner)?.sort().join(',') ?? ''
      const crawledTokens = crawledOwnerMap.get(owner)?.sort().join(',') ?? ''
      if (dbTokens !== crawledTokens) {
        print(`  TOKEN MISMATCH: voter=${voter} owner=${owner}  db=[${dbTokens}]  crawled=[${crawledTokens}]`)
        delegationMismatch = true
      }
    }
  }
  if (!delegationMismatch) print(`  ALL DELEGATIONS MATCH`)

  print('')
}

function printReport(result: RewardDistributionResult) {
  const sep = '─'.repeat(80)
  const { contractTotal } = result

  print('')
  print('╔══════════════════════════════════════════════════════════════════════════════╗')
  print('║                        REWARD DISTRIBUTION REPORT                           ║')
  print('╚══════════════════════════════════════════════════════════════════════════════╝')
  print('')
  print(`  Plugin:       ${result.pluginAddress}`)
  print(`  Network:      ${result.network}`)
  print(`  Epoch:        ${result.epoch}  (writeEpochId=${result.writeEpochId})`)
  print(`  Hook:         ${result.hookEnabled}`)
  print(`  Escrow:       ${result.addresses.escrow}`)
  print(`  Adapter:      ${result.addresses.adapter}`)
  print(`  Lock NFT:     ${result.addresses.lockNFT}`)
  print(`  On-chain VP:  ${contractTotal.toString()}`)
  print(`  Epoch Start:  ${result.votingPeriod.epochStart}`)
  print(`  Vote End:     ${result.votingPeriod.voteEnd}`)
  print('')

  // ── Invariants ──
  print(sep)
  print('  INVARIANTS')
  print(sep)
  for (const inv of result.invariants) {
    print(`  ${inv.name.padEnd(4)} ${inv.pass ? 'PASS' : 'FAIL'}  ${inv.detail}`)
    if (inv.failures) inv.failures.forEach(f => print(`       FAIL: ${f}`))
  }

  // ── Gauges ──
  print('')
  print(sep)
  print(`  GAUGES (${result.gauges.length})`)
  print(sep)
  print(`  ${'#'.padEnd(4)} ${'Gauge'.padEnd(44)} ${'Voting Power'.padStart(24)}`)
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(24)}`)
  result.gauges
    .sort((a, b) => (b.votingPower > a.votingPower ? 1 : b.votingPower < a.votingPower ? -1 : 0))
    .forEach((g, i) => {
      print(`  ${String(i + 1).padEnd(4)} ${g.gauge.padEnd(44)} ${g.votingPower.toString().padStart(24)}`)
    })

  // ── Voters ──
  print('')
  print(sep)
  print(`  ACTIVE VOTERS (${result.voters.length})`)
  print(sep)
  print(
    `  ${'#'.padEnd(4)} ${'Voter'.padEnd(44)} ${'Used VP'.padStart(24)}  ${'Token VP'.padStart(24)}  ${'Block'.padStart(10)}`,
  )
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(24)}  ${'─'.repeat(24)}  ${'─'.repeat(10)}`)
  result.voters
    .sort((a, b) => (b.usedVP > a.usedVP ? 1 : b.usedVP < a.usedVP ? -1 : 0))
    .forEach((v, i) => {
      print(
        `  ${String(i + 1).padEnd(4)} ${v.voter.padEnd(44)} ${v.usedVP.toString().padStart(24)}  ${v.tokenVPSum.toString().padStart(24)}  ${String(v.latestBlock).padStart(10)}`,
      )
    })

  // ── Delegations ──
  print('')
  print(sep)
  print(`  DELEGATION MAP (${result.delegations.length} entries)`)
  print(sep)
  print(`  ${'Voter'.padEnd(44)} ${'Owner'.padEnd(44)} ${'Tokens'}`)
  print(`  ${'─'.repeat(44)} ${'─'.repeat(44)} ${'─'.repeat(20)}`)
  for (const d of result.delegations) {
    print(`  ${d.voter.padEnd(44)} ${d.owner.padEnd(44)} ${d.tokenIds.join(',')}`)
  }

  // ── Owner Rewards ──
  print('')
  print(sep)
  print(`  OWNER REWARDS (${result.ownerRewards.length} owners)`)
  print(sep)
  print(`  ${'#'.padEnd(4)} ${'Owner'.padEnd(44)} ${'Tokens'.padEnd(14)} ${'VP'.padStart(24)}  ${'Share'.padStart(7)}`)
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(14)} ${'─'.repeat(24)}  ${'─'.repeat(7)}`)
  let totalOwnerVP = 0n
  result.ownerRewards
    .sort((a, b) => (b.votingPower > a.votingPower ? 1 : b.votingPower < a.votingPower ? -1 : 0))
    .forEach(({ owner, tokenIds, votingPower }, i) => {
      totalOwnerVP += votingPower
      const pct = contractTotal > 0n ? Number((votingPower * 10000n) / contractTotal) / 100 : 0
      print(
        `  ${String(i + 1).padEnd(4)} ${owner.padEnd(44)} ${tokenIds.join(',').padEnd(14)} ${votingPower.toString().padStart(24)}  ${(pct.toFixed(2) + '%').padStart(7)}`,
      )
    })
  print(`  ${''.padEnd(63)} ${'─'.repeat(24)}`)
  print(`  ${''.padEnd(63)} ${totalOwnerVP.toString().padStart(24)}  total`)
  print('')
}

export const RewardGenerator: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const PLUGIN_ADDRESS: HexAddress =
      (process.env.PLUGIN_ADDRESS as HexAddress) || '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'

    const NETWORK = NetworksEnum.katanaMainnet

    logger.info('Starting RewardGenerator', llo({ pluginAddress: PLUGIN_ADDRESS, network: NETWORK }))

    const clockAddress = await GovernanceVeHelper.getClockAddress(PLUGIN_ADDRESS, NETWORK)
    if (!clockAddress) {
      logger.error('Failed to resolve clock address')
      return
    }

    const currentEpoch = await GaugeHelper.getCurrentEpoch(clockAddress, NETWORK)
    if (!currentEpoch) {
      logger.error('Failed to resolve current epoch')
      return
    }

    const targetEpoch = currentEpoch - 1

    // ── Step 1: Crawl all events and save to file ──
    print('═══ STEP 1: Crawling all events from chain ═══')
    const eventsFilePath = await crawlAndSaveEvents({
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
      epochId: targetEpoch,
    })

    // ── Step 2: Run the main logic (DB-based) ──
    print('')
    print('═══ STEP 2: Running DB-based reward distribution ═══')
    const dbResult = await new VeRewardDistribution({
      epochId: targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
    }).compute()

    if (!dbResult) {
      logger.error('Reward distribution computation failed')
      return
    }

    printReport(dbResult)

    // ── Step 3: Process events from file ──
    print('═══ STEP 3: Processing events from file ═══')
    const fileData: CrawledEventsFile = JSON.parse(fs.readFileSync(eventsFilePath, 'utf-8'))

    const crawledVoters = buildActiveVotersFromFile(fileData.events)
    printCrawledVoters('[CRAWLED]', crawledVoters)

    const { delegationMap: crawledDelegationMap } = buildDelegationMapFromFile(
      fileData.events,
      crawledVoters.voters,
      fileData.hookEnabled,
      fileData.epochStart,
    )
    printDelegationMap('[CRAWLED]', crawledDelegationMap)

    // ── Step 4: Validate ──
    print('')
    print('═══ STEP 4: Validation ═══')
    validateResults(dbResult, crawledVoters, crawledDelegationMap)
  },

  stop: async () => {},
}

export default RewardGenerator
