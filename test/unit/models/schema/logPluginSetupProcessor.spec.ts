import { Models } from '@dbModels'
import LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import { HexAddress, IEventLogPluginType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: LogPluginSetupProcessor', () => {
  let sandbox: SinonSandbox
  let rawLogPluginSetupProcessor: Partial<LogPluginSetupProcessor>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogPluginSetupProcessor = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969' as HexAddress,
      transactionIndex: 1,
      logIndex: 2,
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
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
      const entityId = Models.LogPluginSetupProcessor.getEntityId({
        network: rawLogPluginSetupProcessor.network,
        transactionHash: rawLogPluginSetupProcessor.transactionHash,
        transactionIndex: rawLogPluginSetupProcessor.transactionIndex,
        logIndex: rawLogPluginSetupProcessor.logIndex,
        event: rawLogPluginSetupProcessor.event,
      })
      rawLogPluginSetupProcessor.id = entityId
      const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)

      expect(createdLogDao.id).to.eq(rawLogPluginSetupProcessor.id)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetupProcessor.transactionHash)
      expect(createdLogDao.transactionIndex).to.eq(rawLogPluginSetupProcessor.transactionIndex)
      expect(createdLogDao.logIndex).to.eq(rawLogPluginSetupProcessor.logIndex)
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

    it('Should create LogPluginSetupProcessor without entityId', async () => {
      const entityId = Models.LogPluginSetupProcessor.getEntityId({
        network: rawLogPluginSetupProcessor.network,
        transactionHash: rawLogPluginSetupProcessor.transactionHash,
        transactionIndex: rawLogPluginSetupProcessor.transactionIndex,
        logIndex: rawLogPluginSetupProcessor.logIndex,
        event: rawLogPluginSetupProcessor.event,
      })
      const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)

      expect(createdLogDao.id).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetupProcessor.transactionHash)
      expect(createdLogDao.transactionIndex).to.eq(rawLogPluginSetupProcessor.transactionIndex)
      expect(createdLogDao.logIndex).to.eq(rawLogPluginSetupProcessor.logIndex)
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
      pluginAddress: '0x00',
    })

    expect(createdLogDao.pluginAddress).to.eq('0x00')
  })

  it('Should not update required field with falsy value', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const originalTransactionHash = createdLogDao.transactionHash

    // Try to update required field with null - should not update
    await createdLogDao.update({
      transactionHash: null as any,
    })

    expect(createdLogDao.transactionHash).to.eq(originalTransactionHash)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)

    // Try to update with non-existent field
    await createdLogDao.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(createdLogDao).to.exist
  })

  it('Should not update when value is same as current', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const originalPluginAddress = createdLogDao.pluginAddress

    // Update with same value
    await createdLogDao.update({
      pluginAddress: originalPluginAddress,
    })

    expect(createdLogDao.pluginAddress).to.eq(originalPluginAddress)
  })

  it('Should getEntityId', async () => {
    const network = NetworksEnum.ethereumSepolia
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const transactionIndex = 1
    const logIndex = 1
    const event = IEventLogPluginType.InstallationApplied
    const entityId = Models.LogPluginSetupProcessor.getEntityId({
      network,
      transactionHash,
      transactionIndex,
      logIndex,
      event,
    })
    expect(entityId).to.eq(`${network}-${transactionHash}-${transactionIndex}-${logIndex}-${event}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const foundLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.findExistingLog({
      network: rawLogPluginSetupProcessor.network,
      transactionHash: rawLogPluginSetupProcessor.transactionHash,
      transactionIndex: rawLogPluginSetupProcessor.transactionIndex,
      logIndex: rawLogPluginSetupProcessor.logIndex,
      event: rawLogPluginSetupProcessor.event,
    })
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const foundLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.findByEntityId(
      createdLogPluginSetupProcessor.id,
    )
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('should find plugin by token address', async () => {
    const createdLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.create({
      ...rawLogPluginSetupProcessor,
      tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    })

    const foundLogPluginSetupProcessor = await Models.LogPluginSetupProcessor.findPluginByTokenAddress(
      createdLogPluginSetupProcessor.tokenAddress,
      createdLogPluginSetupProcessor.network,
    )

    expect(foundLogPluginSetupProcessor?.tokenAddress).to.eq(createdLogPluginSetupProcessor.tokenAddress)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    await createdLogDao.reload()

    expect(createdLogDao.daoAddress).to.eq(rawLogPluginSetupProcessor.daoAddress)
  })

  it('should findByPluginAddress', async () => {
    const createdPlugin = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
    const foundLogDao = await Models.LogPluginSetupProcessor.findByPluginAddress(
      createdPlugin.pluginAddress,
      createdPlugin.network,
      createdPlugin.event,
    )
    expect(foundLogDao?.pluginAddress).to.eq(rawLogPluginSetupProcessor.pluginAddress)
  })
})
