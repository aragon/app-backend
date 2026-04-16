import { Models } from '@dbModels'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const PLUGIN_ADDRESS = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9' as HexAddress
const NETWORK = NetworksEnum.katanaMainnet
const DAO_ADDRESS = '0x76De198A3175d046E10f872927C333D29Ff9B914' as HexAddress
const FIX_EPOCH = 0

describe.skip('Integ: RewardGenerator (syncCompleteDao)', function () {
  this.timeout(10000000)

  let sandbox: sinon.SinonSandbox
  let libUtils: LibUtils

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    libUtils = new LibUtils({
      daoAddress: DAO_ADDRESS,
      network: NETWORK,
      config: { sandbox },
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should sync DAO, then compute rewards', async function () {
    const fromBlock = (await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, DAO_ADDRESS, NETWORK))
      .blockNumber
    console.log(`  DAO deployed at block ${fromBlock}`)

    const syncStart = Date.now()
    await libUtils.syncCompleteDao(Number(fromBlock))
    console.log(`  syncCompleteDao took ${Date.now() - syncStart}ms`)

    const plugin = await Models.Plugin.findOne({
      address: PLUGIN_ADDRESS,
      network: NETWORK,
    })
    expect(plugin, 'gauge plugin not found after sync').to.exist

    const tokenDelegationCount = await Models.TokenDelegation.countDocuments({
      contractAddress: plugin.tokenAddress,
      network: NETWORK,
    })
    const voteGaugeCount = await Models.VoteGauge.countDocuments({
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
    })
    console.log(`  After sync: ${tokenDelegationCount} TokenDelegation, ${voteGaugeCount} VoteGauge`)

    const clockAddress = await GovernanceVeHelper.getClockAddress(PLUGIN_ADDRESS, NETWORK)
    const currentEpoch = await GaugeHelper.getCurrentEpoch(clockAddress!, NETWORK)
    const targetEpoch = FIX_EPOCH ? FIX_EPOCH : currentEpoch! - 1
    console.log(`  Computing rewards for epoch ${targetEpoch}`)

    const computeStart = Date.now()
    const result = await new VeRewardDistribution({
      epochId: targetEpoch,
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
      rewardTotalAmount: BigInt(1000 * 1e18),
    }).compute()
    console.log(`  compute() took ${Date.now() - computeStart}ms`)

    expect(result).to.not.be.null
    if ('error' in result!) throw new Error(result!.error)
    expect(result!.ownerRewards).to.be.an('array')
    expect(result!.ownerRewards.length).to.be.greaterThan(0)

    for (const inv of result!.invariants) {
      console.log(`  Invariant ${inv.name}: ${inv.pass ? 'PASS' : 'FAIL'} — ${inv.detail}`)
      if (inv.failures) console.log(`    Failures:`, inv.failures)
      expect(inv.pass, `Invariant ${inv.name} failed: ${inv.detail}`).to.be.true
    }

    console.log(`  Owner rewards: ${result!.ownerRewards.length}`)
    for (const r of result!.ownerRewards) {
      console.log(
        `    owner=${r.owner} tokenIds=${r.tokenIds.length} vp=${r.votingPower} reward=${r.rewardAmount.toString()}`,
      )
    }
  })
})
