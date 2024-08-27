import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberTransaction from '@models/schema/memberTransaction'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { fakeMemberTransactions } from '@test/mock/fakeMemberTransaction'

describe('Model: Member Transaction', () => {
  let sandbox: SinonSandbox
  let rawMemberTransferTx: Partial<MemberTransaction>
  let rawMemberDelegationTx: Partial<MemberTransaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberDelegationTx = {
      ...fakeMemberTransactions[0],
    }

    rawMemberTransferTx = {
      ...fakeMemberTransactions[1],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member balance', () => {
    it('should create new entry of member balance', async () => {
      const entityId = Models.MemberTransaction.getEntityId({
        transactionHash: rawMemberDelegationTx.transactionHash!,
        address: rawMemberDelegationTx.address!,
        side: rawMemberDelegationTx.side!,
        type: rawMemberDelegationTx.type!,
      })

      const MemberMetrics = await Models.MemberTransaction.create(rawMemberDelegationTx)
      expect(MemberMetrics.id).to.eq(entityId)

      expect(MemberMetrics.network).to.eq(rawMemberDelegationTx.network)
      expect(MemberMetrics.address).to.eq(rawMemberDelegationTx.address)
      expect(MemberMetrics.transactionHash).to.eq(rawMemberDelegationTx.transactionHash)
    })

    it('should save without asset if id present', async () => {
      const entityId = Models.MemberTransaction.getEntityId({
        transactionHash: rawMemberDelegationTx.transactionHash!,
        address: rawMemberDelegationTx.address!,
        side: rawMemberDelegationTx.side!,
        type: rawMemberDelegationTx.type!,
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
        }),
      ).to.be.rejectedWith('address is required')
    })

    it('should fail if txHash is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          address: rawMemberDelegationTx.address,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should fail if side is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          address: rawMemberDelegationTx.address,
          transactionHash: rawMemberDelegationTx.transactionHash,
        }),
      ).to.be.rejectedWith('side is required')
    })

    it('should fail if type is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          address: rawMemberDelegationTx.address,
          transactionHash: rawMemberDelegationTx.transactionHash,
          side: rawMemberDelegationTx.side,
        }),
      ).to.be.rejectedWith('type is required')
    })
  })

  it('Should getEntityId', async () => {
    const entityId = Models.MemberTransaction.getEntityId({
      transactionHash: rawMemberTransferTx.transactionHash!,
      address: rawMemberTransferTx.address!,
      side: rawMemberTransferTx.side!,
      type: rawMemberTransferTx.type!,
    })
    const memberDb = await Models.MemberTransaction.create(rawMemberTransferTx)
    expect(entityId).to.eq(memberDb.id)
  })

  it('Should findExistingLog', async () => {
    const entityDb = await Models.MemberTransaction.create(rawMemberDelegationTx)
    const foundedEntityDb = await Models.MemberTransaction.findExistingLog({
      transactionHash: rawMemberDelegationTx.transactionHash!,
      address: rawMemberDelegationTx.address!,
      side: rawMemberDelegationTx.side!,
      type: rawMemberDelegationTx.type!,
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
