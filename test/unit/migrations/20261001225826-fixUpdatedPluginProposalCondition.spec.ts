import { Models } from '@dbModels'
import logger from '@logger'
import fixUpdatedPluginProposalConditionMigration from '@src/migrations/20261001225826-fixUpdatedPluginProposalCondition'
import { IEventLogPluginType, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = '0xb86ce4bcF01f4E00a37E26AB44fd7638825f4df9'
const ANY_ADDR = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'
const ZERO = '0x0000000000000000000000000000000000000000'
const CREATE_PROPOSAL = '0x8c433a4cd6b51969eca37f974940894297b9fcf4b282a213fea5cd8f85289c90'
const OLD_CONDITION = '0x0174DbcaACF7Ac447CBF4a70999d509fbe548b06'
const NEW_CONDITION = '0x69df42478f11d5aAF24d7F1F0a0Af9a1dD4E858B'

const txHash = (n: number) => '0x' + n.toString(16).padStart(64, '0')

const proposalPermission = (plugin: string, operation: number, condition: string) => ({
  operation,
  where: plugin,
  who: ANY_ADDR,
  condition,
  permissionId: CREATE_PROPOSAL,
})

const pluginRow = (
  plugin: string,
  status: IPluginStatus,
  blockNumber: number,
  permissions: any[],
  condition: string,
) => ({
  id: `${NETWORK}-${txHash(blockNumber)}-${plugin}`,
  interfaceType: IPluginInterfaceType.tokenVoting,
  network: NETWORK,
  daoAddress: DAO,
  address: plugin,
  status,
  blockNumber,
  transactionHash: txHash(blockNumber),
  permissions,
  proposalCreationConditionAddress: condition,
})

const seedUpdate = async (plugin: string, blockNumber: number, permissions: any[]) => {
  const preparedSetupId = txHash(blockNumber + 1000)
  await Models.LogPluginSetupProcessor.collection.insertMany([
    {
      id: `${plugin}-${blockNumber}-${IEventLogPluginType.UpdatePrepared}`,
      event: IEventLogPluginType.UpdatePrepared,
      network: NETWORK,
      daoAddress: DAO,
      pluginAddress: plugin,
      preparedSetupId,
      permissions,
      blockNumber: blockNumber - 1,
      transactionHash: txHash(blockNumber - 1),
      transactionIndex: 0,
      logIndex: 0,
    },
    {
      id: `${plugin}-${blockNumber}-${IEventLogPluginType.UpdateApplied}`,
      event: IEventLogPluginType.UpdateApplied,
      network: NETWORK,
      daoAddress: DAO,
      pluginAddress: plugin,
      preparedSetupId,
      permissions: [],
      blockNumber,
      transactionHash: txHash(blockNumber),
      transactionIndex: 0,
      logIndex: 1,
    },
  ] as any)
}

const savedCondition = async (plugin: string) =>
  (await Models.Plugin.findOne({ network: NETWORK, address: plugin, status: IPluginStatus.installed }))
    ?.proposalCreationConditionAddress

describe('migration: fix updated plugin proposal condition', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('moves an updated plugin to the condition its update granted, and is safe to run twice', async () => {
    const plugin = '0x16f4d44082ae9Baf47C80D66A80edA4aE48e08E8'
    const updatePermissions = [
      proposalPermission(plugin, 1, OLD_CONDITION),
      proposalPermission(plugin, 2, NEW_CONDITION),
    ]
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, [proposalPermission(plugin, 2, OLD_CONDITION)], OLD_CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 201, updatePermissions, OLD_CONDITION),
    ] as any)
    await seedUpdate(plugin, 201, updatePermissions)

    await fixUpdatedPluginProposalConditionMigration.start()
    await fixUpdatedPluginProposalConditionMigration.start()

    expect(await savedCondition(plugin)).to.equal(NEW_CONDITION)
  })

  it('keeps the earlier condition when the update leaves the proposal permission alone', async () => {
    const plugin = '0x9415617dd2A0c4f2226572549EE388F70f501580'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, [proposalPermission(plugin, 2, OLD_CONDITION)], OLD_CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 201, [], ZERO),
    ] as any)
    await seedUpdate(plugin, 201, [])

    await fixUpdatedPluginProposalConditionMigration.start()

    expect(await savedCondition(plugin)).to.equal(OLD_CONDITION)
  })

  it('carries the condition of an earlier update through a later update that leaves it alone', async () => {
    const plugin = '0x94D8dB0D0963670ef0CD5e1caC48b1Aeec103205'
    const firstUpdatePermissions = [
      proposalPermission(plugin, 1, OLD_CONDITION),
      proposalPermission(plugin, 2, NEW_CONDITION),
    ]
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, [proposalPermission(plugin, 2, OLD_CONDITION)], OLD_CONDITION),
      pluginRow(plugin, IPluginStatus.deprecated, 201, firstUpdatePermissions, OLD_CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 301, [], ZERO),
    ] as any)
    await seedUpdate(plugin, 201, firstUpdatePermissions)
    await seedUpdate(plugin, 301, [])

    await fixUpdatedPluginProposalConditionMigration.start()

    expect(await savedCondition(plugin)).to.equal(NEW_CONDITION)
  })

  it('leaves the row alone when an applied update has no preparation', async () => {
    const plugin = '0x4CD6c5eEA22Aa897341C5b051E496B8861b29678'
    await Models.Plugin.collection.insertMany([
      pluginRow(plugin, IPluginStatus.deprecated, 100, [proposalPermission(plugin, 2, OLD_CONDITION)], OLD_CONDITION),
      pluginRow(plugin, IPluginStatus.installed, 201, [], ZERO),
    ] as any)
    await seedUpdate(plugin, 201, [])
    await Models.LogPluginSetupProcessor.collection.deleteOne({ event: IEventLogPluginType.UpdatePrepared })

    await fixUpdatedPluginProposalConditionMigration.start()

    expect(await savedCondition(plugin)).to.equal(ZERO)
  })

  it('skips a plugin whose installed row is not its last update', async () => {
    const plugin = '0xa1Ee88fa04E3C29b4FBE45e7EDaEF63eD6833a85'
    await Models.Plugin.collection.insertMany([pluginRow(plugin, IPluginStatus.installed, 100, [], ZERO)] as any)
    await seedUpdate(plugin, 201, [proposalPermission(plugin, 2, NEW_CONDITION)])

    await fixUpdatedPluginProposalConditionMigration.start()

    expect(await savedCondition(plugin)).to.equal(ZERO)
  })
})
