import logger from '@logger'
import GovernanceRewards from '@modules/governanceRewards'
import { EnumConnection, type HexAddress, type IService, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:governanceRewardGenerator' })

// biome-ignore lint/suspicious/noConsole: CLI tool output
const print = (line: string) => console.log(line)

const SIX_MONTHS_IN_DAYS = 180

export const GovernanceRewardGenerator: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const pluginAddress: HexAddress =
      (process.env.PLUGIN_ADDRESS as HexAddress) || '0x1652FDd272fEf49B53bd102550DE775519e60b8E'
    const network = (process.env.NETWORK as NetworksEnum) || NetworksEnum.ethereumSepolia
    const totalAmount = BigInt(process.env.TOTAL_AMOUNT || String(1000n * 10n ** 18n))
    const lookbackDays = Number(process.env.LOOKBACK_DAYS || SIX_MONTHS_IN_DAYS)
    const lookbackDate =
      process.env.LOOKBACK_DATE || new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

    logger.info(
      'Starting GovernanceRewardGenerator',
      llo({ pluginAddress, network, totalAmount: totalAmount.toString(), lookbackDate }),
    )

    print('')
    print('╔══════════════════════════════════════════════════════════════════════════════╗')
    print('║                   GOVERNANCE REWARD DISTRIBUTION                            ║')
    print('╚══════════════════════════════════════════════════════════════════════════════╝')
    print('')
    print(`  Plugin:     ${pluginAddress}`)
    print(`  Network:    ${network}`)
    print(`  Total:      ${totalAmount.toString()}`)
    print(`  Lookback:   ${lookbackDate}`)
    print('')

    const result = await new GovernanceRewards({
      pluginAddress,
      network,
      totalAmount,
      lookbackDate,
    }).compute()

    if ('error' in result) {
      logger.error('Governance reward computation failed', llo({ error: result.error }))
      print(`  ERROR: ${result.error}`)
      return
    }

    if (result.length === 0) {
      print('  No eligible stakers found.')
      return
    }

    const sep = '─'.repeat(80)
    print(sep)
    print(`  STAKER REWARDS (${result.length} stakers)`)
    print(sep)
    print(`  ${'#'.padEnd(4)} ${'Staker'.padEnd(44)} ${'Reward Amount'.padStart(28)}`)
    print(`  ${'─'.repeat(4)} ${'─'.repeat(44)} ${'─'.repeat(28)}`)

    let totalDistributed = 0n
    result
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
      .forEach(({ address, amount }, i) => {
        totalDistributed += amount
        print(`  ${String(i + 1).padEnd(4)} ${address.padEnd(44)} ${amount.toString().padStart(28)}`)
      })

    print(`  ${''.padEnd(49)} ${'─'.repeat(28)}`)
    print(`  ${''.padEnd(49)} ${totalDistributed.toString().padStart(28)}  total`)
    print('')
  },

  stop: async () => {},
}

export default GovernanceRewardGenerator
