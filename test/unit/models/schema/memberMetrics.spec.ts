import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberMetrics from '@models/schema/memberMetrics'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeMemberMetrics } from '@test/mock/fakeMemberMetrics'

describe('Model: MemberMetrics', () => {
  let sandbox: SinonSandbox
  let rawMemberMetrics: Partial<MemberMetrics>
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberMetrics = {
      ...FakeMemberMetrics,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member balance', () => {
    it('should create new entry of member balance', async () => {
      const entityId = Models.MemberMetrics.getEntityId({
        network: rawMemberMetrics.network!,
        address: rawMemberMetrics.address!,
        pluginAddress: rawMemberMetrics.pluginAddress!,
      })

      const MemberMetrics = await Models.MemberMetrics.create(rawMemberMetrics)
      expect(MemberMetrics.id).to.eq(entityId)

      expect(MemberMetrics.network).to.eq(rawMemberMetrics.network)
      expect(MemberMetrics.address).to.eq(rawMemberMetrics.address)
      expect(MemberMetrics.pluginAddress).to.eq(rawMemberMetrics.pluginAddress)
    })

    it('should save without asset if id present', async () => {
      const entityId = Models.MemberMetrics.getEntityId({
        network: rawMemberMetrics.network!,
        address: rawMemberMetrics.address!,
        tokenAddress: rawMemberMetrics.tokenAddress!,
      })

      rawMemberMetrics.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.MemberMetrics, 'getEntityId')
      await Models.MemberMetrics.create(rawMemberMetrics)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when token address is not present', async () => {
      await expect(
        Models.MemberMetrics.create({
          network: rawMemberMetrics.network,
          address: rawMemberMetrics.address,
        }),
      ).to.be.rejectedWith('pluginAddress is required')
    })

    it('should fail when network is not present', async () => {
      await expect(
        Models.MemberMetrics.create({
          pluginAddress: rawMemberMetrics.pluginAddress,
          address: rawMemberMetrics.address,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should fail when address is not present', async () => {
      await expect(
        Models.MemberMetrics.create({
          pluginAddress: rawMemberMetrics.pluginAddress,
          network: rawMemberMetrics.network,
        }),
      ).to.be.rejectedWith('memberAddress is required')
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.MemberMetrics.getEntityId({
      network: rawMemberMetrics.network!,
      address: rawMemberMetrics.address!,
      pluginAddress: rawMemberMetrics.pluginAddress!,
    })
    const memberDb = await Models.MemberMetrics.create(rawMemberMetrics)
    expect(entityId).to.eq(memberDb.id)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.MemberMetrics.create(rawMemberMetrics)
    const foundLogDao = await Models.MemberMetrics.findExistingLog({
      network: createdLogDao.network!,
      address: createdLogDao.address!,
      pluginAddress: createdLogDao.pluginAddress!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogMemberMetrics = await Models.MemberMetrics.create(rawMemberMetrics)
    const foundLogDao = await Models.MemberMetrics.findByEntityId(createdLogMemberMetrics.id)
    expect(foundLogDao?.id).to.eq(createdLogMemberMetrics.id)
  })

  it('Should findByAddress', async () => {
    const createdMemberMetrics = await Models.MemberMetrics.create(rawMemberMetrics)
    const member = await Models.MemberMetrics.findByAddress(createdMemberMetrics.address, createdMemberMetrics.network)
    expect(member?.address).to.eq(createdMemberMetrics.address)
  })

  it('should update MemberMetrics', async () => {
    const member = await Models.MemberMetrics.create(rawMemberMetrics)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.MemberMetrics.create(rawMemberMetrics)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawMemberMetrics.address)
  })

  it('should decreaseDelegateReceivedCount', async () => {
    const member = await Models.MemberMetrics.create({ ...rawMemberMetrics, delegateReceivedCount: 1 })
    const updatedMember = await member.decreaseDelegateReceivedCount(1)
    expect(updatedMember.delegateReceivedCount).to.eq(0)
  })

  it('should increaseDelegateReceivedCount', async () => {
    const member = await Models.MemberMetrics.create(rawMemberMetrics)
    const updatedMember = await member.increaseDelegateReceivedCount(1)
    expect(updatedMember.delegateReceivedCount).to.eq(2)
  })

  it('should increaseVoteCount', async () => {
    const member = await Models.MemberMetrics.create(rawMemberMetrics)
    const updatedMember = await member.increaseVoteCount(1)
    expect(updatedMember.voteCount).to.eq(13)
  })

  it('should increaseProposalCount', async () => {
    const member = await Models.MemberMetrics.create(rawMemberMetrics)
    const updatedMember = await member.increaseProposalCount(1)
    expect(updatedMember.proposalCount).to.eq(15)
  })
})
