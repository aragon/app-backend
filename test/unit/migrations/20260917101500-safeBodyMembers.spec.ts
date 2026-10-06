import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance } from '@src/governance'
import safeBodyMembersMigration from '@src/migrations/20260917101500-safeBodyMembers'
import {
  EnumQueueName,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const DAO = '0x665928FeacC8739116A3f2eF66a9c61936348DC2'
const SPP = '0x000000000000000000000000000000000000a001'
const OTHER_DAO = '0x00000000000000000000000000000000000000D2'
const PROCESS_SAFE = '0x000000000000000000000000000000000000fe01'
const NOT_SAFE_BODY = '0x00000000000000000000000000000000000B0d1E'

describe('migration: safe body members', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves(null)
    await Models.Setting.collection.dropIndexes().catch(() => undefined)

    await Models.Plugin.create({
      address: SPP,
      daoAddress: DAO,
      network: NETWORK,
      transactionHash: `0x${SPP.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await Models.Setting.create({
      transactionHash: `0x${SPP.slice(2).padEnd(64, '1')}`,
      blockNumber: 1,
      network: NETWORK,
      status: ISettingStatus.active,
      daoAddress: DAO,
      pluginAddress: SPP,
      stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
  })

  afterEach(() => sandbox?.restore())

  const addSppDao = async (daoAddress: string, network: NetworksEnum, bodies: object[]) => {
    const sppAddress = `0x${daoAddress.slice(-38)}aa`
    await Models.Plugin.create({
      address: sppAddress,
      daoAddress,
      network,
      transactionHash: `0x${sppAddress.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await Models.Setting.create({
      transactionHash: `0x${sppAddress.slice(2).padEnd(64, '1')}`,
      blockNumber: 1,
      network,
      status: ISettingStatus.active,
      daoAddress,
      pluginAddress: sppAddress,
      stages: [{ stageIndex: 0, plugins: bodies }],
    })
  }

  const metricsRequests = () =>
    (RabbitMQHelper.sendMessage as sinon.SinonStub)
      .getCalls()
      .filter(call => call.args[0] === EnumQueueName.daoMetrics)
      .map(call => `${call.args[1].params.network}-${call.args[1].params.address}`)

  it('skips a DAO whose bodies are not Safes', async () => {
    await addSppDao(OTHER_DAO, NETWORK, [{ address: NOT_SAFE_BODY, brandId: VotingBodyBrandIdentity.EOA }])

    await safeBodyMembersMigration.start()

    expect(metricsRequests()).to.deep.equal([`${NETWORK}-${DAO}`])
    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnceWith(NETWORK, SAFE)).to.be.true
  })

  it('skips a DAO whose Safe body has no address and whose addressed body is not a Safe', async () => {
    await addSppDao(OTHER_DAO, NETWORK, [
      { address: null, brandId: VotingBodyBrandIdentity.SAFE },
      { address: NOT_SAFE_BODY, brandId: VotingBodyBrandIdentity.OTHER },
    ])

    await safeBodyMembersMigration.start()

    expect(metricsRequests()).to.deep.equal([`${NETWORK}-${DAO}`])
  })

  it('seeds a DAO whose only Safe is a process plugin', async () => {
    await Models.Plugin.create({
      address: PROCESS_SAFE,
      daoAddress: OTHER_DAO,
      network: NETWORK,
      transactionHash: `0x${PROCESS_SAFE.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
      isSupported: true,
    })

    await safeBodyMembersMigration.start()

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: PROCESS_SAFE })).to.equal(1)
    expect(metricsRequests()).to.have.members([`${NETWORK}-${DAO}`, `${NETWORK}-${OTHER_DAO}`])
  })

  it('seeds a DAO found as both a Safe body and a Safe process once', async () => {
    await Models.Plugin.create({
      address: SAFE,
      daoAddress: DAO,
      network: NETWORK,
      transactionHash: `0x${SAFE.slice(2).padEnd(64, '0')}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
      isSupported: true,
    })

    await safeBodyMembersMigration.start()

    expect(metricsRequests()).to.deep.equal([`${NETWORK}-${DAO}`])
    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnce).to.be.true
  })

  it('seeds the same DAO address on two networks separately', async () => {
    await addSppDao(DAO, NetworksEnum.ethereumMainnet, [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }])

    await safeBodyMembersMigration.start()

    expect(metricsRequests()).to.have.members([`${NETWORK}-${DAO}`, `${NetworksEnum.ethereumMainnet}-${DAO}`])
    expect(
      await Models.SafeMember.countDocuments({ network: NetworksEnum.ethereumMainnet, safeAddress: SAFE }),
    ).to.equal(1)
  })

  it('seeds owners into global SafeMember rows', async () => {
    await safeBodyMembersMigration.start()

    const rows = await Models.SafeMember.find({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].id).to.equal(`${NETWORK}-${SAFE}-${OWNER}`)
    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnceWith(NETWORK, SAFE)).to.be.true
  })

  it('builds the body-address index the owner events look the DAO up with', async () => {
    await safeBodyMembersMigration.start()

    const keys = (await Models.Setting.collection.indexes()).map((index: { key: object }) => JSON.stringify(index.key))
    expect(keys).to.include(JSON.stringify({ network: 1, status: 1, 'stages.plugins.address': 1 }))
  })

  it('is idempotent and does not reread an already seeded Safe', async () => {
    await safeBodyMembersMigration.start()
    await safeBodyMembersMigration.start()

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(1)
    expect((SafeChainReaderModule.readOwners as sinon.SinonStub).calledOnce).to.be.true
  })

  it('preserves migration progress when the Safe owner read fails', async () => {
    ;(SafeChainReaderModule.readOwners as sinon.SinonStub).rejects(new Error('provider unavailable'))

    await safeBodyMembersMigration.start()

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(0)
  })

  describe('stop', () => {
    it('resolves', async () => {
      await expect(safeBodyMembersMigration.stop()).to.eventually.be.undefined
    })
  })
})
