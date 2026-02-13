import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'
import { EnumConnection, type HexAddress, type IService, type RewardDistributionResult, NetworksEnum } from '@types'
import { computeRewardDistribution } from '@modules/veRewardDistribution'

const llo = logger.logMeta.bind(null, { service: 'tool:rewardGenerator' })

const PLUGIN_ADDRESS: HexAddress =
  (process.env.PLUGIN_ADDRESS as HexAddress) || '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'

function resolveNetwork(env?: string): NetworksEnum {
  if (!env) return NetworksEnum.katanaMainnet
  if (env in NetworksEnum) return NetworksEnum[env as keyof typeof NetworksEnum]
  return env as NetworksEnum
}

const NETWORK = resolveNetwork(process.env.NETWORK)

function printReport(result: RewardDistributionResult) {
  const sep = '─'.repeat(80)
  const print = (line: string) => console.log(line)
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
  print(
    `  ${'#'.padEnd(4)} ${'Gauge'.padEnd(44)} ${'Indexed VP'.padStart(24)}  ${'Contract VP'.padStart(24)}  ${'Share'.padStart(7)}`,
  )
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(24)}  ${'─'.repeat(24)}  ${'─'.repeat(7)}`)
  result.gauges
    .sort((a, b) => (b.indexedVP > a.indexedVP ? 1 : b.indexedVP < a.indexedVP ? -1 : 0))
    .forEach((g, i) => {
      print(
        `  ${String(i + 1).padEnd(4)} ${g.gauge.padEnd(44)} ${g.indexedVP.toString().padStart(24)}  ${g.contractVP.toString().padStart(24)}  ${(g.share.toFixed(2) + '%').padStart(7)}`,
      )
    })

  // ── Voters ──
  print('')
  print(sep)
  print(`  ACTIVE VOTERS (${result.voters.length})`)
  print(sep)
  print(
    `  ${'#'.padEnd(4)} ${'Voter'.padEnd(44)} ${'Used VP'.padStart(24)}  ${'Token VP'.padStart(24)}  ${'On-chain VP'.padStart(24)}  ${'Block'.padStart(10)}`,
  )
  print(
    `  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(24)}  ${'─'.repeat(24)}  ${'─'.repeat(24)}  ${'─'.repeat(10)}`,
  )
  result.voters
    .sort((a, b) => (b.usedVP > a.usedVP ? 1 : b.usedVP < a.usedVP ? -1 : 0))
    .forEach((v, i) => {
      print(
        `  ${String(i + 1).padEnd(4)} ${v.voter.padEnd(44)} ${v.usedVP.toString().padStart(24)}  ${v.tokenVPSum.toString().padStart(24)}  ${v.onChainVP.toString().padStart(24)}  ${String(v.latestBlock).padStart(10)}`,
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

    const result = await computeRewardDistribution({
      epochId: targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
    })

    if (!result) {
      logger.error('Reward distribution computation failed')
      return
    }

    printReport(result)
  },

  stop: async () => {},
}

export default RewardGenerator
