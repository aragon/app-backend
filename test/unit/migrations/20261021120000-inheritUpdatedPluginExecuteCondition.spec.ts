import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EXECUTE_PERMISSION_ID } from '@modules/safe/safeDaoAssociations'
import inheritUpdatedPluginExecuteConditionMigration from '@src/migrations/20261021120000-inheritUpdatedPluginExecuteCondition'
import {
  EnumQueueName,
  IConditionInterfaceType,
  IEventLogPermission,
  IPluginInterfaceType,
  IPluginStatus,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.baseMainnet
const DAO = '0x9d649C6442a76cCe7Dff95E2621E4dcedc26ca95'
const CONDITION = '0xEA93696b97C821ec8deC2e12394993c945c48058'
const OTHER_CONDITION = '0x392BFf3A3B9855B2F0bF6bFC99B9D7127B6eEA23'

const txHash = (n: number) => '0x' + n.toString(16).padStart(64, '0')

const pluginRow = (plugin: string, status: IPluginStatus, blockNumber: number, condition: string | null) => ({
  id: `${NETWORK}-${txHash(blockNumber)}-${plugin}`,
  interfaceType: IPluginInterfaceType.spp,
  network: NETWORK,
  daoAddress: DAO,
  address: plugin,
  status,
  blockNumber,
  transactionHash: txHash(blockNumber),
  conditionAddress: condition,
  conditionInterfaceType: condition ? IConditionInterfaceType.executeSelector : null,
})

const executeEvent = (plugin: string, event: IEventLogPermission, blockNumber: number, condition?: string) => ({
  id: `${NETWORK}-${txHash(blockNumber)}-${plugin}-${event}`,
  network: NETWORK,
  daoAddress: DAO,
  whoAddress: plugin,
  whereAddress: DAO,
  permissionId: EXECUTE_PERMISSION_ID,
  event,
  conditionAddress: condition,
  blockNumber,
  transactionHash: txHash(blockNumber),
  transactionIndex: 0,
  logIndex: 0,
})

const installedRow = (plugin: string) =>
  Models.Plugin.findOne({ network: NETWORK, address: plugin, status: IPluginStatus.installed })

describe('migration: inherit updated plugin execute condition', () => {
  let sandbox: SinonSandbox
  let sendMessageStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('puts the condition of the deprecated row back on the installed row, and is safe to run twice', async () => {
    const plugin = '0x918f6F1c077D80e393c936fe400999A9b71a3665'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await inheritUpdatedPluginExecuteConditionMigration.start()
    await inheritUpdatedPluginExecuteConditionMigration.start()

    const installed = await installedRow(plugin)
    expect(installed?.conditionAddress).to.equal(CONDITION)
    expect(installed?.conditionInterfaceType).to.equal(IConditionInterfaceType.executeSelector)
    // the second run finds the condition already set, so the crawl is queued once
    expect(sendMessageStub.calledOnce).to.be.true
    expect(sendMessageStub.firstCall.args).to.deep.equal([
      EnumQueueName.logSelectorPermission,
      {
        id: `${installed?.id}-${CONDITION}`,
        params: { address: plugin, network: NETWORK, daoAddress: DAO, conditionAddress: CONDITION },
      },
    ])
  })

  it('carries the condition through an earlier update that also lost it', async () => {
    const plugin = '0xFB5674e5E1b85B4Ea2dEB799B4E2aA1657a8641B'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.deprecated, 200, null),
      pluginRow(plugin, IPluginStatus.installed, 300, null),
    ] as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await inheritUpdatedPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.equal(CONDITION)
    expect(sendMessageStub.calledOnce).to.be.true
  })

  it('leaves the installed row alone when EXECUTE was revoked after the update', async () => {
    const plugin = '0xCE5bdAa5cBb2dFE16a6DA4d8F0eC6AA3324748ce'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(plugin, IEventLogPermission.Revoked, 300, CONDITION),
    ] as any)

    await inheritUpdatedPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null

    expect(sendMessageStub.called).to.be.false
  })

  it('leaves the installed row alone when EXECUTE was granted again without a condition', async () => {
    const plugin = '0xD209e983C4e629d5c363CA5602BD54F9a39D2cF5'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(plugin, IEventLogPermission.Granted, 300),
    ] as any)

    await inheritUpdatedPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null

    expect(sendMessageStub.called).to.be.false
  })

  it('keeps a condition the installed row already has', async () => {
    const plugin = '0xA2074142A770Cba1CBE1fca2E3446FAcdD6E419b'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, OTHER_CONDITION),
    ] as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 300, OTHER_CONDITION) as any,
    )

    await inheritUpdatedPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.equal(OTHER_CONDITION)

    expect(sendMessageStub.called).to.be.false
  })
})
