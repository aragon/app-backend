import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IEventLogPluginType, NetworksEnum } from '@types'
import LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: LogPluginSetupProcessor', () => {
  let sandbox: SinonSandbox
  let rawLogPluginSetupProcessor: Partial<LogPluginSetupProcessor>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawLogPluginSetupProcessor = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      event: IEventLogPluginType.InstallationApplied,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      preparedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
      appliedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5402',
      pluginSetupRepo: '0x17366cae2b9c6c3055e9e3c78936a69006be5403',
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
      sender: '0x17366cae2b9c6c3055e9e3c78936a69006be5405',
      release: '1',
      build: '2',
      permissions: [
        {
          operation: 1,
          where: 'some-where',
          who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
          condition: 'some-conditions',
          permissionId: 'xxx',
        },
      ],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogPluginSetupProcessor', async () => {
    it('Should create LogPluginSetupProcessor', async () => {
      const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetupProcessor.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginSetupProcessor.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginSetupProcessor.network)
      expect(createdLogDao.event).to.eq(rawLogPluginSetupProcessor.event)
      expect(createdLogDao.daoAddress).to.eq(rawLogPluginSetupProcessor.daoAddress)
      expect(createdLogDao.preparedSetupId).to.eq(rawLogPluginSetupProcessor.preparedSetupId)
      expect(createdLogDao.appliedSetupId).to.eq(rawLogPluginSetupProcessor.appliedSetupId)
      expect(createdLogDao.pluginSetupRepo).to.eq(rawLogPluginSetupProcessor.pluginSetupRepo)
      expect(createdLogDao.plugin).to.eq(rawLogPluginSetupProcessor.plugin)
      expect(createdLogDao.sender).to.eq(rawLogPluginSetupProcessor.sender)
      expect(createdLogDao.release).to.eq(rawLogPluginSetupProcessor.release)
      expect(createdLogDao.build).to.eq(rawLogPluginSetupProcessor.build)
      expect(createdLogDao.permissions.length).to.eq(1)
      expect(createdLogDao.permissions[0].operation).to.eq(1)
      expect(createdLogDao.permissions[0].where).to.eq('some-where')
      expect(createdLogDao.permissions[0].who).to.eq('0x17366cae2b9c6c3055e9e3c78936a69006be5400')
      expect(createdLogDao.permissions[0].condition).to.eq('some-conditions')
      expect(createdLogDao.permissions[0].permissionId).to.eq('xxx')
    })
  })

  it('Should update LogPluginSetupProcessor', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    expect(createdLogDao.plugin).to.eq(rawLogPluginSetupProcessor.plugin)

    await createdLogDao.update({
      pluginAddress: 'new-plugin',
    })

    expect(createdLogDao.plugin).to.eq('new-plugin')
  })

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const logPluginSetupProcessor = await Models.LogPluginSetupProcessor.findTxHash(createdLogDao.transactionHash)
    expect(logPluginSetupProcessor?.address).to.eq(rawLogPluginSetupProcessor.address)
  })

  it('Should findTxHashAndEvent', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const logPluginSetupProcessor = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      createdLogDao.transactionHash,
      IEventLogPluginType.InstallationApplied,
    )
    expect(logPluginSetupProcessor?.daoAddress).to.eq(rawLogPluginSetupProcessor.daoAddress)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    await createdLogDao.reload()

    expect(createdLogDao.daoAddress).to.eq(rawLogPluginSetupProcessor.daoAddress)
  })
})
