import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MemberTransaction from '@models/schema/memberTransaction'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { fakeMemberTransactions } from '@test/mock/fakeMemberTransaction'
import Token from '@models/schema/token'
import { FakeToken } from '@test/mock/fakeToken'
import { ITransferSide, ITransferType } from '@types'

describe('Model: Member Transaction', () => {
  let sandbox: SinonSandbox
  let rawMemberDelegationTx: Partial<MemberTransaction>
  let rawMemberDelegationTx2: Partial<MemberTransaction>
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawMemberDelegationTx = {
      ...fakeMemberTransactions[0],
      type: ITransferType.delegate,
    }

    rawMemberDelegationTx2 = {
      ...fakeMemberTransactions[1],
      type: ITransferType.delegate,
    }

    rawToken = {
      ...(FakeToken as any),
      address: rawMemberDelegationTx.tokenAddress,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('it should create member transaction', () => {
    it('should create new entry of member transaction', async () => {
      const entityId = Models.MemberTransaction.getEntityId({
        transactionHash: rawMemberDelegationTx.transactionHash!,
        network: rawMemberDelegationTx.network,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
      })

      const memberTransaction = await Models.MemberTransaction.create(rawMemberDelegationTx)
      expect(memberTransaction.id).to.eq(entityId)

      expect(memberTransaction.network).to.eq(rawMemberDelegationTx.network)
      expect(memberTransaction.address).to.eq(rawMemberDelegationTx.address)
      expect(memberTransaction.transactionHash).to.eq(rawMemberDelegationTx.transactionHash)
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
          transactionHash: rawMemberDelegationTx.transactionHash,
          logIndex: rawMemberDelegationTx.logIndex,
          address: rawMemberDelegationTx.address,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('should fail if transaction index is not present', async () => {
      await expect(
        Models.MemberTransaction.create({
          network: rawMemberDelegationTx.network,
          transactionHash: rawMemberDelegationTx.transactionHash,
          transactionIndex: rawMemberDelegationTx.transactionIndex,
          address: rawMemberDelegationTx.address,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })
  })

  describe('getEntityId', () => {
    it('should generate an entity ID with tokenId', () => {
      const params = {
        network: rawMemberDelegationTx.network!,
        transactionHash: rawMemberDelegationTx.transactionHash!,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
      }
      const entityId = Models.MemberTransaction.getEntityId(params)
      expect(entityId).to.eq(
        `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.address}`,
      )
    })

    it('should generate an entity ID without tokenId', () => {
      const params = {
        network: rawMemberDelegationTx.network!,
        transactionHash: rawMemberDelegationTx.transactionHash!,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
      }
      const entityId = Models.MemberTransaction.getEntityId(params)
      expect(entityId).to.eq(
        `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.address}`,
      )
    })
  })

  describe('findExistingLog', () => {
    it('should find an existing log without tokenId', async () => {
      const createdTx = await Models.MemberTransaction.create(rawMemberDelegationTx)
      const foundTx = await Models.MemberTransaction.findExistingLog({
        network: rawMemberDelegationTx.network!,
        transactionHash: rawMemberDelegationTx.transactionHash!,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
      })
      expect(foundTx?.id).to.eq(createdTx.id)
    })

    it('should find an existing log with tokenId', async () => {
      const txWithTokenId = {
        ...rawMemberDelegationTx,
        tokenId: 123,
      }
      const createdTx = await Models.MemberTransaction.create(txWithTokenId)
      const foundTx = await Models.MemberTransaction.findExistingLog({
        network: rawMemberDelegationTx.network!,
        transactionHash: rawMemberDelegationTx.transactionHash!,
        transactionIndex: rawMemberDelegationTx.transactionIndex!,
        logIndex: rawMemberDelegationTx.logIndex!,
        address: rawMemberDelegationTx.address!,
        tokenId: 123,
      })
      expect(foundTx?.id).to.eq(createdTx.id)
    })
  })

  describe('findByEntityId', () => {
    it('should find by entity ID', async () => {
      const createdTx = await Models.MemberTransaction.create(rawMemberDelegationTx)
      const foundTx = await Models.MemberTransaction.findByEntityId(createdTx.id)
      expect(foundTx?.id).to.eq(createdTx.id)
    })
  })

  describe('getReceiveDelegationCount', () => {
    it('should return 0 when no delegation received', async () => {
      const count = await Models.MemberTransaction.getReceiveDelegationCount(
        'nonexistent-address',
        'nonexistent-token',
        rawMemberDelegationTx.network!,
      )
      expect(count).to.eq(0)
    })

    it('should count net delegate type transactions (incoming - outgoing)', async () => {
      // Create multiple transactions
      await Models.MemberTransaction.create({
        ...rawMemberDelegationTx,
        type: ITransferType.delegate,
        side: ITransferSide.incoming,
      })
      await Models.MemberTransaction.create({
        ...rawMemberDelegationTx,
        logIndex: rawMemberDelegationTx.logIndex! + 1,
        type: ITransferType.delegate,
        side: ITransferSide.outgoing, // Should subtract from count
      })
      await Models.MemberTransaction.create({
        ...rawMemberDelegationTx,
        logIndex: rawMemberDelegationTx.logIndex! + 2,
        type: ITransferType.delegate,
        side: ITransferSide.incoming,
      })

      const count = await Models.MemberTransaction.getReceiveDelegationCount(
        rawMemberDelegationTx.address!,
        rawMemberDelegationTx.tokenAddress!,
        rawMemberDelegationTx.network!,
      )
      expect(count).to.eq(1) // 2 incoming - 1 outgoing = 1
    })
  })

  describe('reload', () => {
    it('should reload the document', async () => {
      const createdTx = await Models.MemberTransaction.create(rawMemberDelegationTx)
      await createdTx.reload()
      expect(createdTx.address).to.eq(rawMemberDelegationTx.address)
    })
  })
})
