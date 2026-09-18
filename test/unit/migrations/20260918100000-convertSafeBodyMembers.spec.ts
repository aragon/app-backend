import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import convertSafeBodyMembersMigration from '@src/migrations/20260918100000-convertSafeBodyMembers'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const DAO_ONE = '0x665928FeacC8739116A3f2eF66a9c61936348DC2'
const DAO_TWO = '0x4eB35B2D6d5C5B2F0f0f7f7f7f7f7f7f7f7f7f7f'

const legacySafeRow = (id: string, daoAddress = DAO_ONE, memberAddress = OWNER) => ({
  id,
  memberAddress,
  daoAddress,
  pluginAddress: SAFE,
  network: NETWORK,
  source: 'safe',
})

describe('migration: convert Safe body members', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    await Models.SafeMember.collection.deleteMany({})
    await Models.PluginMember.collection.deleteMany({})
  })

  afterEach(() => sandbox.restore())

  it('deduplicates DAO copies into one global SafeMember and refreshes each affected DAO once', async () => {
    await Models.PluginMember.collection.insertMany([
      legacySafeRow('legacy-one', DAO_ONE),
      legacySafeRow('legacy-two', DAO_TWO),
      legacySafeRow('legacy-three', DAO_ONE),
    ])

    await convertSafeBodyMembersMigration.start()

    const members = await Models.SafeMember.find({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
    expect(members).to.have.lengthOf(1)
    expect(members[0].id).to.equal(`${NETWORK}-${SAFE}-${OWNER}`)
    expect(await Models.PluginMember.collection.countDocuments({ source: 'safe' })).to.equal(0)
    const sendMessageStub = RabbitMQHelper.sendMessage as sinon.SinonStub
    expect(sendMessageStub.callCount).to.equal(2)
    expect(
      sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
        id: DAO_ONE,
        params: { address: DAO_ONE, network: NETWORK },
      }),
    ).to.be.true
    expect(
      sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
        id: DAO_TWO,
        params: { address: DAO_TWO, network: NETWORK },
      }),
    ).to.be.true
  })

  it('is safe to rerun after conversion', async () => {
    await Models.PluginMember.collection.insertOne(legacySafeRow('legacy-one'))

    await convertSafeBodyMembersMigration.start()
    await convertSafeBodyMembersMigration.start()

    expect(await Models.SafeMember.collection.countDocuments({})).to.equal(1)
    expect(await Models.PluginMember.collection.countDocuments({ source: 'safe' })).to.equal(0)
  })

  it('fails on a destination write and preserves the legacy row for retry', async () => {
    await Models.PluginMember.collection.insertOne(legacySafeRow('legacy-one'))
    const writeError = new Error('database unavailable')
    sandbox.stub(Models.SafeMember, 'updateOne').rejects(writeError)

    await expect(convertSafeBodyMembersMigration.start()).to.be.rejectedWith('database unavailable')

    expect(await Models.PluginMember.collection.countDocuments({ source: 'safe' })).to.equal(1)
    expect(await Models.SafeMember.collection.countDocuments({})).to.equal(0)
  })

  it('preserves malformed legacy rows and ordinary plugin rows', async () => {
    await Models.PluginMember.collection.insertMany([
      { id: 'malformed', daoAddress: DAO_ONE, pluginAddress: SAFE, network: NETWORK, source: 'safe' },
      {
        id: 'ordinary',
        memberAddress: OWNER,
        daoAddress: DAO_ONE,
        pluginAddress: SAFE,
        network: NETWORK,
        source: 'plugin',
      },
    ])

    await convertSafeBodyMembersMigration.start()

    expect(await Models.PluginMember.collection.countDocuments({ id: 'malformed' })).to.equal(1)
    expect(await Models.PluginMember.collection.countDocuments({ id: 'ordinary' })).to.equal(1)
    expect(await Models.SafeMember.collection.countDocuments({})).to.equal(0)
  })

  it('does not depend on the old migration having run first', async () => {
    await convertSafeBodyMembersMigration.start()

    expect(await Models.SafeMember.collection.countDocuments({})).to.equal(0)
  })

  describe('stop', () => {
    it('resolves', async () => {
      await expect(convertSafeBodyMembersMigration.stop()).to.eventually.be.undefined
    })
  })

  after(async () => {
    await mongoose.connection.collection('SafeMember').deleteMany({})
    await mongoose.connection.collection('PluginMember').deleteMany({})
  })
})
