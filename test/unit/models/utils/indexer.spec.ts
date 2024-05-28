import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { UtilsIndexer } from '@models/utils/indexer'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'

describe('Model/Utils: indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('saveSync', () => {
    it('should saveSync', async () => {
      const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
      const networkDbStub = { update: sandbox.stub().resolves() }
      const crawlerStub = { crawlResult: { nbError: 0, latestBlockNumber: 1234 } }

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
        await txFn({ session: sessionStub })
      })

      await UtilsIndexer.saveSync(crawlerStub as any, networkDbStub as any, 'lastBlockMetadataLog')

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(networkDbStub.update.calledOnce).to.be.true
      expect(
        networkDbStub.update.calledWith({
          lastBlockMetadataLog: 1234,
        }),
      ).to.be.true
      expect(sessionStub.commitTransaction.calledOnce).to.be.true
      expect(sessionStub.endSession.calledOnce).to.be.true
    })

    it('should not update saveSync', async function () {
      const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
      const crawlerStub = { crawlResult: { nbError: 0, latestBlockNumber: 0 } }
      const networkDbStub = { update: sandbox.stub().resolves() }

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
        await txFn({ session: sessionStub })
      })

      await UtilsIndexer.saveSync(crawlerStub as any, networkDbStub as any, 'lastBlockMetadataLog')

      expect(executeTxFnStub.calledOnce).to.be.false
      expect(networkDbStub.update.called).to.be.false
      expect(sessionStub.commitTransaction.called).to.be.false
      expect(sessionStub.endSession.called).to.be.false
    })
  })

  describe('saveAggregationSync', () => {
    it('should saveAggregationSync', async () => {
      const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
      const aggregatorDbStub = { update: sandbox.stub().resolves() }
      const crawlerStub = { crawlResult: { nbError: 0, lastCreatedAt: new Date() } }

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
        await txFn({ session: sessionStub })
      })

      await UtilsIndexer.saveAggregationSync(crawlerStub as any, aggregatorDbStub as any, 'lastAggregationMetadataLog')

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(aggregatorDbStub.update.calledOnce).to.be.true
      expect(
        aggregatorDbStub.update.calledWith({
          lastAggregationMetadataLog: crawlerStub.crawlResult.lastCreatedAt,
        }),
      ).to.be.true
      expect(sessionStub.commitTransaction.calledOnce).to.be.true
      expect(sessionStub.endSession.calledOnce).to.be.true
    })

    it('should not update saveAggregationSync', async () => {
      const sessionStub = { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() }
      const aggregatorDbStub = { update: sandbox.stub().resolves() }
      const crawlerStub = { crawlResult: { nbError: 0 } } // lastCreatedAt is not set

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async txFn => {
        await txFn({ session: sessionStub })
      })

      await UtilsIndexer.saveAggregationSync(crawlerStub as any, aggregatorDbStub as any, 'lastAggregationMetadataLog')

      expect(executeTxFnStub.calledOnce).to.be.false
      expect(aggregatorDbStub.update.called).to.be.false
      expect(sessionStub.commitTransaction.called).to.be.false
      expect(sessionStub.endSession.called).to.be.false
    })
  })

  describe('saveAggregationSync', () => {
    it('should return existing token if found', async () => {
      const existingToken = { id: 'token123', symbol: 'TKN' }
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(existingToken)

      const result = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(result).to.equal(existingToken)
    })

    it('should detect token type and create new token if not found', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.ERC20, implementationAddress: '0x456' } as any)
      const stubGetToken = sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: '0x123',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        totalSupply: 2000,
      })

      const token = await UtilsIndexer.saveAndGetToken('0x123', NetworksEnum.mainnet)

      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubGetToken.calledOnce).to.be.true
      expect(token!.address).to.eq('0x123')
      expect(token!.type).to.eq(ITokenType.ERC20)
      expect(token!.implementationAddress).to.eq('0x456')
      expect(token!.name).to.eq('TokenName')
      expect(token!.decimals).to.eq(18)
      expect(token!.symbol).to.eq('TKN')
      expect(token!.totalSupply).to.eq(2000)
      expect(token!.network).to.eq(NetworksEnum.mainnet)
    })
  })
})
