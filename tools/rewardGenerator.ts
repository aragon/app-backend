import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { EnumConnection, type HexAddress, type IService, NetworksEnum, type RewardDistributionResult } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:rewardGenerator' })

// biome-ignore lint/suspicious/noConsole: CLI tool output
const print = (line: string) => console.log(line)

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

  // ── Owner Rewards ──
  print('')
  print(sep)
  print(`  OWNER REWARDS (${result.ownerRewards.length} owners)  total=${result.rewardTotalAmount.toString()}`)
  print(sep)
  print(
    `  ${'#'.padEnd(4)} ${'Owner'.padEnd(44)} ${'Tokens'.padEnd(14)} ${'VP'.padStart(24)}  ${'Reward'.padStart(24)}`,
  )
  print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(14)} ${'─'.repeat(24)}  ${'─'.repeat(24)}`)
  let totalReward = 0n
  result.ownerRewards
    .sort((a, b) => (b.rewardAmount > a.rewardAmount ? 1 : b.rewardAmount < a.rewardAmount ? -1 : 0))
    .forEach(({ owner, tokenIds, votingPower, rewardAmount }, i) => {
      totalReward += rewardAmount
      print(
        `  ${String(i + 1).padEnd(4)} ${owner.padEnd(44)} ${tokenIds.join(',').padEnd(14)} ${votingPower.toString().padStart(24)}  ${rewardAmount.toString().padStart(24)}`,
      )
    })
  print(`  ${''.padEnd(63)} ${'─'.repeat(24)}  ${'─'.repeat(24)}`)
  print(`  ${''.padEnd(63)} ${''.padStart(24)}  ${totalReward.toString().padStart(24)}  total`)
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
    const rewardTotalAmount = BigInt(1000 * 1e18)

    const result = await new VeRewardDistribution({
      epochId: targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
      rewardTotalAmount,
    }).compute()

    if (!result) {
      logger.error('Reward distribution computation failed')
      return
    }

    if ('error' in result) {
      logger.error('Reward distribution error', llo({ error: result.error }))
      return
    }

    printReport(result)
  },

  stop: async () => {},
}

export default RewardGenerator
