import { ICollectionNames, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { waitForOne } from '../helpers/dbWaiters'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { setupCrossChainDao } from '../setups/crossChainDaoSetup'
import type { CrossChainDaoDeployment } from '../types/crossChainFixture'

const NETWORK = NetworksEnum.ethereumMainnet

describe('CrossChainController indexing — anvil', function () {
  this.timeout(600_000)
  this.slow(0)

  let dep: CrossChainDaoDeployment

  before(async () => {
    await resetFork()
    const startBlock = await getAnvilProvider().getBlockNumber()

    dep = await setupCrossChainDao()

    await startServices(startBlock)
    await waitForIndexerCatchup(await getAnvilProvider().getBlockNumber(), 180_000)
  })

  after(() => stopServices())

  it('identifies the installed plugin as a crossChainController, not a governance body', async () => {
    const plugin = await waitForOne(
      ICollectionNames.Plugin,
      { network: NETWORK, address: dep.controller },
      p => p.status === 'installed',
    )

    expect(plugin.interfaceType).to.equal(IPluginInterfaceType.crossChainController)
    expect(plugin.isBody).to.equal(false)
    expect(plugin.isProcess).to.equal(false)
    expect(plugin.daoAddress).to.equal(dep.dao)
    expect(plugin.pluginSetupRepoAddress).to.equal(dep.pluginRepo)
  })

  it('captures the controller configuration into Setting.crossChain', async () => {
    const setting = await waitForOne(
      ICollectionNames.Setting,
      { network: NETWORK, pluginAddress: dep.controller },
      s => !!s.crossChain?.executor && (s.crossChain?.lanes?.length ?? 0) > 0 && !!s.crossChain?.minFailedMessageGas,
    )

    expect(setting.daoAddress).to.equal(dep.dao)
    expect(setting.crossChain.executor).to.equal(dep.executor)
    expect(setting.crossChain.executorIsDao).to.equal(false)
    expect(setting.crossChain.minFailedMessageGas).to.equal(dep.minFailedMessageGas)
    expect(setting.crossChain.lanes).to.have.lengthOf(1)
    expect(setting.crossChain.lanes[0].chainId).to.equal(1)
    expect(setting.crossChain.lanes[0].localAdapter).to.equal(dep.adapter)
    expect(setting.crossChain.lanes[0].remoteAdapter).to.equal(dep.adapter)
    expect(setting.crossChain.lanes[0].feeToken).to.equal(ethers.ZeroAddress)
  })

  it('links the condition to the plugin and records allowed selectors with their chain', async () => {
    const permission = await waitForOne(
      ICollectionNames.SelectorPermission,
      { network: NETWORK, conditionAddress: dep.selectorCondition, selector: dep.allowedSelector },
      p => p.isAllowed === true,
    )

    expect(permission.pluginAddress).to.equal(dep.controller)
    expect(permission.daoAddress).to.equal(dep.dao)
    expect(permission.target).to.equal(dep.selectorTarget)
    // 2-param event: chainId falls back to the emitting chain's id.
    expect(permission.chainId).to.equal(1)
  })

  it('disallowing a selector clears only that selector, scoped by chain', async () => {
    const disallowed = await waitForOne(
      ICollectionNames.SelectorPermission,
      { network: NETWORK, conditionAddress: dep.selectorCondition, selector: dep.disallowedSelector },
      p => p.isAllowed === false,
    )

    expect(disallowed.chainId).to.equal(1)
    expect(disallowed.disallowed.status).to.equal(true)
    expect(disallowed.disallowed.transactionHash).to.be.a('string')

    // The sibling selector on the same target stays allowed.
    const stillAllowed = await waitForOne(
      ICollectionNames.SelectorPermission,
      { network: NETWORK, conditionAddress: dep.selectorCondition, selector: dep.allowedSelector },
      p => p.isAllowed === true,
    )
    expect(stillAllowed.target).to.equal(dep.selectorTarget)
  })
})
