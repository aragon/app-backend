import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginAction, NetworksEnum } from '@types'
import Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import { beforeEach } from 'mocha'

describe('Model: Plugin', () => {
  let sandbox: SinonSandbox
  let rawPlugin: Partial<Plugin>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

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
      rawPlugin.id = Models.Plugin.getEntityId({
        network: rawPlugin.network!,
        transactionHash: rawPlugin.transactionHash!,
        action: rawPlugin.action!,
      })
      const createdLogDao = await Models.Plugin.create(rawPlugin)

      expect(createdLogDao.id).to.eq(rawPlugin.id)
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
    const entityId = Models.Plugin.getEntityId({ transactionHash, action, network })
    expect(entityId).to.eq(`${transactionHash}-${action}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetupProcessor = await Models.Plugin.create(rawPlugin)
    const foundLogPluginSetupProcessor = await Models.Plugin.findExistingLog({
      transactionHash: createdLogPluginSetupProcessor.transactionHash,
      action: createdLogPluginSetupProcessor.action,
      network: createdLogPluginSetupProcessor.network,
    })
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetupProcessor = await Models.Plugin.create(rawPlugin)
    const foundLogPluginSetupProcessor = await Models.Plugin.findByEntityId(createdLogPluginSetupProcessor.id)
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Plugin.create(rawPlugin)
    await createdLogDao.reload()

    expect(createdLogDao.daoAddress).to.eq(rawPlugin.daoAddress)
  })

  it('Should filterKeys of plugin', async () => {
    const createdPlugin = await Models.Plugin.create(rawPlugin)
    const filterDao = createdPlugin.filterKeys()

    expect(filterDao.id).to.exist
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(14)
  })

  it('should findByAddress', async () => {
    const createdPlugin = await Models.Plugin.create(rawPlugin)
    const foundPlugin = await Models.Plugin.findByAddress(createdPlugin.address)
    expect(foundPlugin?.address).to.eq(createdPlugin.address)
  })
})
