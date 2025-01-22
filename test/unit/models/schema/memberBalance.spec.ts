import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberBalance from '@models/schema/memberBalance'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { fakeMemberBalance } from '@test/mock/fakeMemberBalance'

describe('Model: MemberBalance', () => {
  let sandbox: SinonSandbox
  let rawMemberBalance: Partial<MemberBalance>
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberBalance = {
      ...fakeMemberBalance,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member balance', () => {
    it('should create new entry of member balance', async () => {
      const entityId = Models.MemberBalance.getEntityId({
        network: rawMemberBalance.network!,
        address: rawMemberBalance.address!,
        tokenAddress: rawMemberBalance.tokenAddress!,
      })

      const memberBalance = await Models.MemberBalance.create(rawMemberBalance)
      expect(memberBalance.id).to.eq(entityId)

      expect(memberBalance.network).to.eq(rawMemberBalance.network)
      expect(memberBalance.address).to.eq(rawMemberBalance.address)
      expect(memberBalance.tokenAddress).to.eq(rawMemberBalance.tokenAddress)
    })

    it('should save without asset if id present', async () => {
      const entityId = Models.MemberBalance.getEntityId({
        network: rawMemberBalance.network!,
        address: rawMemberBalance.address!,
        tokenAddress: rawMemberBalance.tokenAddress!,
      })

      rawMemberBalance.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.MemberBalance, 'getEntityId')
      await Models.MemberBalance.create(rawMemberBalance)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when token address is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          network: rawMemberBalance.network,
          address: rawMemberBalance.address,
        }),
      ).to.be.rejectedWith('tokenAddress is required')
    })

    it('should fail when network is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          tokenAddress: rawMemberBalance.tokenAddress,
          address: rawMemberBalance.address,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should fail when address is not present', async () => {
      await expect(
        Models.MemberBalance.create({
          tokenAddress: rawMemberBalance.tokenAddress,
          network: rawMemberBalance.network,
        }),
      ).to.be.rejectedWith('memberAddress is required')
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.MemberBalance.getEntityId({
      network: rawMemberBalance.network!,
      address: rawMemberBalance.address!,
      tokenAddress: rawMemberBalance.tokenAddress!,
    })
    const memberDb = await Models.MemberBalance.create(rawMemberBalance)
    expect(entityId).to.eq(memberDb.id)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    const foundLogDao = await Models.MemberBalance.findExistingLog({
      network: createdLogDao.network!,
      address: createdLogDao.address!,
      tokenAddress: createdLogDao.tokenAddress!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    const foundLogDao = await Models.MemberBalance.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByAddress', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await Models.MemberBalance.findByAddress(createdMember.tokenAddress, createdMember.network)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should update Member', async () => {
    const member = await Models.MemberBalance.create(rawMemberBalance)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.MemberBalance.create(rawMemberBalance)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawMemberBalance.address)
  })

  it('should increase the balance', async () => {
    rawMemberBalance.amount = '0'
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await createdMember.increaseBalance({ amount: '1000', blockNumber: 1232323, tokenId: 1 })
    expect(member?.amount).to.eq('1000')
    expect(member?.tokenIds.length).to.eq(1)
    expect(member?.tokenIds[0]).to.eq(1)
  })

  describe('increaseBalance', () => {
    it('should decrease the balance', async () => {
      rawMemberBalance.amount = '1000'
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.decreaseBalance({ amount: '1000', blockNumber: 1232323, tokenId: 1 })
      expect(member?.amount).to.eq('0')
      expect(member?.tokenIds.length).to.eq(0)
    })

    it('should not decrease the balance if current balance is less than decrement', async () => {
      rawMemberBalance.amount = '1000'
      const createdMember = await Models.MemberBalance.create(rawMemberBalance)
      const member = await createdMember.decreaseBalance({ amount: '1001', blockNumber: 1232323 })
      expect(member?.amount).to.eq('1000')
      expect(member?.tokenIds.length).to.eq(0)
    })
  })

  it('should updateVotingPower', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await createdMember.updateVotingPower('1000', 1232323)
    expect(member?.votingPower).to.eq('1000')
  })

  it('should find by findByAddressAndToken', async () => {
    const createdMember = await Models.MemberBalance.create(rawMemberBalance)
    const member = await Models.MemberBalance.findByAddressAndToken({
      address: createdMember.address,
      tokenAddress: createdMember.tokenAddress,
      network: createdMember.network,
    })
    expect(member?.address).to.eq(createdMember.address)
  })
})
