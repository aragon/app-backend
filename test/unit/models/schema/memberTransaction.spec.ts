import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberTransaction from '@models/schema/memberTransaction'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { fakeMemberTransactions } from '@test/mock/fakeMemberTransaction'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import Token from '@models/schema/token'
import { FakeToken } from '@test/mock/fakeToken'

describe('Model: Member Transaction', () => {
  let sandbox: SinonSandbox
  let rawMemberTransferTx: Partial<MemberTransaction>
  let rawMemberDelegationTx: Partial<MemberTransaction>
  let rawDaoMemberMapping: Partial<DaoMemberMapping>
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberDelegationTx = {
      ...fakeMemberTransactions[0],
    }

    rawMemberTransferTx = {
      ...fakeMemberTransactions[1],
    }

    rawDaoMemberMapping = {
      ...(FakeDaoMemberMappings[0] as any),
      tokenAddress: rawMemberTransferTx.tokenAddress,
      memberAddress: rawMemberTransferTx.address,
    }

    rawToken = {
      ...(FakeToken as any),
      address: rawMemberTransferTx.tokenAddress,
    }

    await Models.DaoMemberMapping.create(rawDaoMemberMapping)

    await Models.DaoMemberMapping.create({
      ...rawDaoMemberMapping,
      memberAddress: rawMemberDelegationTx.address,
      id: Models.DaoMemberMapping.getEntityId({
        network: rawDaoMemberMapping.network,
        memberAddress: rawMemberDelegationTx.address!,
        tokenOrPluginAddress: rawMemberDelegationTx.tokenAddress!,
      }),
    })

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member balance', () => {
    it('should create new entry of member balance', async () => {
      const entityId = Models.MemberTransaction.getEntityId({
        transactionHash: rawMemberDelegationTx.transactionHash!,
        network: rawMemberDelegationTx.network,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
        tokenId: 10,
      })

      const MemberMetrics = await Models.MemberTransaction.create(rawMemberDelegationTx)
      expect(MemberMetrics.id).to.eq(entityId)

      expect(MemberMetrics.network).to.eq(rawMemberDelegationTx.network)
      expect(MemberMetrics.address).to.eq(rawMemberDelegationTx.address)
      expect(MemberMetrics.transactionHash).to.eq(rawMemberDelegationTx.transactionHash)
      expect(MemberMetrics.tokenId).to.eq(rawMemberDelegationTx.tokenId)
    })

    it('should save without asset if id present', async () => {
      const entityId = Models.MemberTransaction.getEntityId({
        transactionHash: rawMemberDelegationTx.transactionHash!,
        network: rawMemberDelegationTx.network,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
      })

      rawMemberDelegationTx.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.MemberTransaction, 'getEntityId')
      await Models.MemberTransaction.create(rawMemberDelegationTx)
      expect(getEntityIdSpy.called).to.be.false
    })

    it('should fail when address is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          transactionHash: rawMemberDelegationTx.transactionHash,
          transactionIndex: rawMemberDelegationTx.transactionIndex,
          logIndex: rawMemberDelegationTx.logIndex,
        }),
      ).to.be.rejectedWith('address is required')
    })

    it('should fail if txHash is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          transactionIndex: rawMemberDelegationTx.transactionIndex,
          logIndex: rawMemberDelegationTx.logIndex,
          address: rawMemberDelegationTx.address,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should fail if transaction index is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          address: rawMemberDelegationTx.address,
          transactionHash: rawMemberDelegationTx.transactionHash,
          logIndex: rawMemberDelegationTx.logIndex,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('should fail if log index is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          address: rawMemberDelegationTx.address,
          transactionHash: rawMemberDelegationTx.transactionHash,
          transactionIndex: rawMemberDelegationTx.transactionIndex,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.MemberTransaction.getEntityId({
      network: rawMemberDelegationTx.network!,
      transactionHash: rawMemberTransferTx.transactionHash!,
      transactionIndex: rawMemberTransferTx.transactionIndex!,
      logIndex: rawMemberTransferTx.logIndex!,
      address: rawMemberTransferTx.address!,
    })
    const memberDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    expect(entityId).to.eq(memberDb.id)
  })

  it('Should findExistingLog', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberDelegationTx)
    const foundedEntityDb = await Models.MemberTransaction.findExistingLog({
      network: rawMemberDelegationTx.network!,
      transactionHash: rawMemberDelegationTx.transactionHash!,
      transactionIndex: rawMemberDelegationTx.transactionIndex!,
      logIndex: rawMemberDelegationTx.logIndex!,
      address: rawMemberTransferTx.address!,
    })
    expect(foundedEntityDb?.id).to.eq(entityDb.id)
  })

  it('should find by entity id', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    const foundedEntityDb = await Models.MemberTransaction.findByEntityId(entityDb.id)
    expect(foundedEntityDb?.id).to.eq(entityDb.id)
  })

  it('should find by address', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    const foundedEntityDb = await Models.MemberTransaction.findByAddress(entityDb.address, entityDb.network)
    expect(foundedEntityDb?.id).to.eq(entityDb.id)
  })

  it('should update', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    const updatedEntityDb = await entityDb.update({ address: '0x00' })
    expect(updatedEntityDb.address).to.eq('0x00')
  })

  it('should reload', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    await entityDb.reload()
    expect(entityDb.id).to.eq(entityDb.id)
  })
})
