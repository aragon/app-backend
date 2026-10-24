import { Models } from '@dbModels'
import ConditionDetector from '@helpers/conditionDetector'
import logger from '@logger'
import { EXECUTE_PERMISSION_ID } from '@modules/safe/safeDaoAssociations'
import { LogSelectorPermission } from '@services/aragon-plugins/logSelectorPermission'
import recoverPluginExecuteConditionMigration from '@src/migrations/20261021120000-recoverPluginExecuteCondition'
import { IConditionInterfaceType, IEventLogPermission, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.baseMainnet
const DAO = '0x9d649C6442a76cCe7Dff95E2621E4dcedc26ca95'
const CONDITION = '0xEA93696b97C821ec8deC2e12394993c945c48058'
const OTHER_CONDITION = '0x392BFf3A3B9855B2F0bF6bFC99B9D7127B6eEA23'

const txHash = (n: number) => '0x' + n.toString(16).padStart(64, '0')

const pluginRow = (
  plugin: string,
  status: IPluginStatus,
  blockNumber: number,
  condition: string | null,
  overrides: Record<string, unknown> = {},
) => ({
  id: `${NETWORK}-${txHash(blockNumber)}-${plugin}`,
  interfaceType: IPluginInterfaceType.spp,
  network: NETWORK,
  daoAddress: DAO,
  address: plugin,
  status,
  isProcess: true,
  blockNumber,
  transactionHash: txHash(blockNumber),
  conditionAddress: condition,
  conditionInterfaceType: condition ? IConditionInterfaceType.executeSelector : null,
  ...overrides,
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

describe('migration: recover plugin execute condition', () => {
  let sandbox: SinonSandbox
  let crawlStub: sinon.SinonStub
  let errorStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    errorStub = sandbox.stub(logger, 'error')
    sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
    crawlStub = sandbox.stub(LogSelectorPermission, 'start').resolves()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('sets the condition of the latest EXECUTE grant on an updated plugin and crawls it, once', async () => {
    const plugin = '0x918f6F1c077D80e393c936fe400999A9b71a3665'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await recoverPluginExecuteConditionMigration.start()
    await recoverPluginExecuteConditionMigration.start()

    const installed = await installedRow(plugin)
    expect(installed?.conditionAddress).to.equal(CONDITION)
    expect(installed?.conditionInterfaceType).to.equal(IConditionInterfaceType.executeSelector)
    // the second run finds the condition already set, so the crawl runs once
    expect(crawlStub.calledOnce).to.be.true
    expect(crawlStub.firstCall.args[0]).to.include({ address: plugin, conditionAddress: CONDITION })
  })

  it('also fixes an installed row with no deprecated row before it', async () => {
    const plugin = '0xFB5674e5E1b85B4Ea2dEB799B4E2aA1657a8641B'
    await Models.Plugin.collection.insertOne(pluginRow(plugin, IPluginStatus.installed, 200, null) as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.equal(CONDITION)
    expect(crawlStub.calledOnce).to.be.true
  })

  it('takes the latest grant when it differs from the deprecated row', async () => {
    const plugin = '0x31Ca9697d49C5EAb2fA6b41C034D862fA3FA012C'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(plugin, IEventLogPermission.Granted, 300, OTHER_CONDITION),
    ] as any)

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.equal(OTHER_CONDITION)
  })

  it('leaves the installed row alone when EXECUTE was revoked', async () => {
    const plugin = '0xCE5bdAa5cBb2dFE16a6DA4d8F0eC6AA3324748ce'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(plugin, IEventLogPermission.Revoked, 300, CONDITION),
    ] as any)

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null
    expect(crawlStub.called).to.be.false
  })

  it('leaves the installed row alone when EXECUTE was granted without a condition', async () => {
    const plugin = '0xD209e983C4e629d5c363CA5602BD54F9a39D2cF5'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 200, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(plugin, IEventLogPermission.Granted, 300),
    ] as any)

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null
    expect(crawlStub.called).to.be.false
  })

  it('leaves the installed row alone when there is no EXECUTE event at all', async () => {
    const plugin = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
    await Models.Plugin.collection.insertOne(pluginRow(plugin, IPluginStatus.installed, 200, null) as any)

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null
    expect(crawlStub.called).to.be.false
  })

  it('leaves a plugin alone when it is not installed, even with a grant carrying a condition', async () => {
    const plugin = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
    await Models.Plugin.collection.insertOne(pluginRow(plugin, IPluginStatus.deprecated, 200, null) as any)
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await recoverPluginExecuteConditionMigration.start()

    expect(crawlStub.called).to.be.false
  })

  it('leaves a row that is not a process alone, as the Safe association clears its condition on purpose', async () => {
    const plugin = '0xb619f4dEb9652bdf5060fEA8e1c66dE781a0C74D'
    await Models.Plugin.collection.insertOne(
      pluginRow(plugin, IPluginStatus.installed, 200, null, {
        interfaceType: IPluginInterfaceType.safe,
        isProcess: false,
        isBody: true,
      }) as any,
    )
    await Models.DaoPermission.collection.insertOne(
      executeEvent(plugin, IEventLogPermission.Granted, 100, CONDITION) as any,
    )

    await recoverPluginExecuteConditionMigration.start()

    expect((await installedRow(plugin))?.conditionAddress).to.be.null
    expect(crawlStub.called).to.be.false
  })

  it('carries on with the other plugins when a crawl fails', async () => {
    const first = '0xA2074142A770Cba1CBE1fca2E3446FAcdD6E419b'
    const second = '0x73AE5a6aF49a516e860b740204703b1dE6712d2d'
    await Models.Plugin.collection.insertMany([
      pluginRow(first, IPluginStatus.installed, 200, null),
      pluginRow(second, IPluginStatus.installed, 201, null),
    ] as any)
    await Models.DaoPermission.collection.insertMany([
      executeEvent(first, IEventLogPermission.Granted, 100, CONDITION),
      executeEvent(second, IEventLogPermission.Granted, 101, OTHER_CONDITION),
    ] as any)
    crawlStub.onFirstCall().rejects(new Error('rpc down'))

    await recoverPluginExecuteConditionMigration.start()

    expect(crawlStub.calledTwice).to.be.true
    expect((await installedRow(first))?.conditionAddress).to.equal(CONDITION)
    expect((await installedRow(second))?.conditionAddress).to.equal(OTHER_CONDITION)
    expect(errorStub.calledWithMatch('Failed to fix EXECUTE conditions for 1 plugin(s)')).to.be.true
  })
})
