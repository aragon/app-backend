import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginAction, NetworksEnum } from '@types'
import Plugin from '@models/schema/plugin'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: Plugin', () => {
  let sandbox: SinonSandbox
  let rawPlugin: Partial<Plugin>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'

    rawPlugin = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      action: IPluginAction.install,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5402',
      tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5403',
      pluginSetupRepoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
      sender: '0x17366cae2b9c6c3055e9e3c78936a69006be5405',
      release: '1',
      build: '2',
      subdomain: 'dao.eth',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Plugin', async () => {
    it('Should create Plugin', async () => {
      const entityId = Models.Plugin.getEntityId(rawPlugin.transactionHash, rawPlugin.action)
      rawPlugin.entityId = entityId
      const createdLogDao = await Models.Plugin.create(rawPlugin)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawPlugin.entityId)
      expect(createdLogDao.transactionHash).to.eq(rawPlugin.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawPlugin.blockNumber)
      expect(createdLogDao.network).to.eq(rawPlugin.network)
      expect(createdLogDao.action).to.eq(rawPlugin.action)
      expect(createdLogDao.address).to.eq(rawPlugin.address)
      expect(createdLogDao.implementationAddress).to.eq(rawPlugin.implementationAddress)
      expect(createdLogDao.daoAddress).to.eq(rawPlugin.daoAddress)
      expect(createdLogDao.tokenAddress).to.eq(rawPlugin.tokenAddress)
      expect(createdLogDao.pluginSetupRepoAddress).to.eq(rawPlugin.pluginSetupRepoAddress)
      expect(createdLogDao.sender).to.eq(rawPlugin.sender)
      expect(createdLogDao.release).to.eq(rawPlugin.release)
      expect(createdLogDao.build).to.eq(rawPlugin.build)
      expect(createdLogDao.subdomain).to.eq(rawPlugin.subdomain)
    })
  })

  it('Should update Plugin', async () => {
    const createdLogDao = await Models.Plugin.create(rawPlugin)
    expect(createdLogDao.plugin).to.eq(rawPlugin.plugin)

    await createdLogDao.update({
      pluginSetupRepoAddress: '0x00',
    })

    expect(createdLogDao.pluginSetupRepoAddress).to.eq('0x00')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const action = IPluginAction.install
    const network = NetworksEnum.mainnet
    const entityId = Models.Plugin.getEntityId(transactionHash, action, network)
    expect(entityId).to.eq(`${transactionHash}-${action}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetupProcessor = await Models.Plugin.create(rawPlugin)
    const foundLogPluginSetupProcessor = await Models.Plugin.findExistingLog(
      createdLogPluginSetupProcessor.transactionHash,
      createdLogPluginSetupProcessor.action,
      createdLogPluginSetupProcessor.network,
    )
    expect(foundLogPluginSetupProcessor?.entityId).to.eq(createdLogPluginSetupProcessor.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetupProcessor = await Models.Plugin.create(rawPlugin)
    const foundLogPluginSetupProcessor = await Models.Plugin.findByEntityId(createdLogPluginSetupProcessor.entityId)
    expect(foundLogPluginSetupProcessor?.entityId).to.eq(createdLogPluginSetupProcessor.entityId)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Plugin.create(rawPlugin)
    await createdLogDao.reload()

    expect(createdLogDao.daoAddress).to.eq(rawPlugin.daoAddress)
  })
})
