import { Models } from '@dbModels'
import { LogCrossChain } from '@plugins/logCrossChain'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { type HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: CrossChain DAO full sync — base', () => {
  const network = NetworksEnum.baseMainnet
  const daoAddress = '0x5b353764C68B1d504C654C3D5d7DA834c8954C09' as HexAddress
  const deploymentBlock = 49350143

  // The two SPP plugins granted EXECUTE *with* a condition in the deployment tx.
  const sppWithCondition = [
    { plugin: '0x34527a3dAb78eD4f4De8E70AbeAcf3D5F120AE08', condition: '0x37B1cC6EB8D14EAf2E2184101D244FC129eB85B7' },
    { plugin: '0x282003A90F09B7e70505AF5eD45c4de259Ef8D0d', condition: '0xdcdd7689C920A1DeF009bfCB2ecb47BE353a8027' },
  ]

  let sandbox: SinonSandbox

  afterEach(() => {
    sandbox?.restore()
  })

  it('syncs the DAO and links the condition onto every conditioned plugin', async function () {
    this.timeout(900_000)

    sandbox = sinon.createSandbox()
    const libUtils = new LibUtils({
      daoAddress,
      network,
      config: {
        sandbox,
        processQueues: { proposalActions: true },
      },
    })

    await libUtils.syncCompleteDao(deploymentBlock - 1)

    // ───────────────── DAO ─────────────────
    const dao = await Models.Dao.findOne({ address: daoAddress, network }).lean()
    expect(dao, 'DAO not indexed').to.exist
    expect(dao!.blockNumber).to.equal(deploymentBlock)

    // ───────────────── Plugins ─────────────────
    const plugins = await Models.Plugin.find({ daoAddress, network }).lean()

    expect(plugins.length, 'expected the 7 plugins from the deployment tx').to.be.at.least(7)
    expect(plugins.filter(p => p.interfaceType === IPluginInterfaceType.spp)).to.have.lengthOf(2)
    expect(plugins.filter(p => p.interfaceType === IPluginInterfaceType.tokenVoting)).to.have.lengthOf(4)
    expect(plugins.filter(p => p.interfaceType === IPluginInterfaceType.multisig)).to.have.lengthOf(1)

    // ───────────────── Conditioned grants ─────────────────
    for (const { plugin, condition } of sppWithCondition) {
      const grant = await Models.DaoPermission.findOne({
        network,
        daoAddress,
        whoAddress: plugin,
        conditionAddress: condition,
      }).lean()
      expect(grant, `no conditioned grant row for ${plugin}`).to.exist
      expect(grant!.event).to.equal('Granted')
    }

    // ───────────────── The production bug ─────────────────
    for (const { plugin, condition } of sppWithCondition) {
      const row = await Models.Plugin.findOne({ address: plugin, network }).lean()
      expect(row, `plugin ${plugin} not indexed`).to.exist
      expect(row!.conditionAddress, `conditionAddress not linked for ${plugin}`).to.equal(condition)
    }

    // ───────────────── Selector permissions ─────────────────
    // Linking conditionAddress enqueues `logSelectorPermission`, which the rabbit stub
    // routes to LogSelectorPermission, so the condition's SelectorAllowed logs are crawled.
    for (const { plugin, condition } of sppWithCondition) {
      const rows = await Models.SelectorPermission.find({ network, conditionAddress: condition }).lean()
      for (const row of rows) {
        expect(row.pluginAddress, 'selector row must attach to the granted plugin').to.equal(plugin)
        expect(row.chainId, 'chainId must always be numeric').to.be.a('number')
      }
    }

    // ───────────────── CrossChainController ─────────────────
    // The rabbit stub routes the plugins queue to LogCrossChain, so the controller's
    // configuration events land in `Setting.crossChain` as the real consumer would.
    const controller = plugins.find(p => p.interfaceType === IPluginInterfaceType.crossChainController)

    expect(controller.isBody, 'controller must not be a governance body').to.equal(false)
    expect(controller.isProcess, 'controller must not be a process').to.equal(false)

    await LogCrossChain.start(controller as never)

    const setting = await Models.Setting.findOne({ network, pluginAddress: controller.address }).lean()

    expect(setting?.crossChain, 'crossChain settings not captured by LogCrossChain').to.exist
    expect(setting!.crossChain.executor, 'executor not captured').to.be.a('string')
    expect(setting!.crossChain.lanes, 'lanes not captured').to.be.an('array')

    for (const lane of setting!.crossChain.lanes) {
      expect(lane.feeToken, `feeToken not read for lane ${lane.chainId}`).to.be.a('string')
      expect(ethers.isAddress(lane.feeToken!), `feeToken is not an address for lane ${lane.chainId}`).to.equal(true)
    }
  })
})
