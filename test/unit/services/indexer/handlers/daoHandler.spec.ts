import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ITransactionType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoHandler } from '@services/indexer/handlers/daoHandler'
import { Models } from '@dbModels'

describe('Indexer: DaoHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('callbackReceived', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.callbackReceived(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  describe('deposited', () => {
    it('should deposit native token', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledTwice).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
      expect(savedDaoLog.tokenAddress).to.eq(null)
      expect(savedDaoLog.tokenId).to.eq(null)
      expect(savedDaoLog.reference).to.eq(fakeEvent.args._reference)
      expect(savedDaoLog.actionIndex).to.eq(0)
    })

    it('should deposit erc20 token', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 0n,
          token: '0x0',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledTwice).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
      expect(savedDaoLog.tokenAddress).to.eq(fakeEvent.args.token)
      expect(savedDaoLog.tokenId).to.eq(null)
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
    })
  })

  it('executed', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.executed(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('granted', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.granted(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('nativeTokenDeposited', async () => {
    const network = NetworksEnum.mainnet
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        sender: '0x123',
        amount: 10n,
        _reference: 'some reference',
      },
    }

    const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
    const stubLogger = sandbox.stub(logger, 'verbose')

    await DaoHandler.nativeTokenDeposited(fakeEvent as any, txLog, network)

    expect(findTxHashSpy.calledOnce).to.be.true
    expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
    expect(stubLogger.calledTwice).to.be.true

    const savedDaoLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, ITransactionType.deposit, 0)
    expect(!!savedDaoLog).to.be.true

    expect(savedDaoLog.entityId).to.exist
    expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
    expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
    expect(savedDaoLog.network).to.eq(network)
    expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
    expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
    expect(savedDaoLog.to).to.eq(txLog.address)
    expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
    expect(savedDaoLog.tokenAddress).to.eq(null)
    expect(savedDaoLog.tokenId).to.eq(null)
    expect(savedDaoLog.reference).to.eq(null)
    expect(savedDaoLog.actionIndex).to.eq(0)
  })

  it('newURI', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.newURI(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('revoked', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.revoked(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('standardCallbackRegistered', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.standardCallbackRegistered(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('trustedForwarderSet', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.trustedForwarderSet(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('uri updated', async () => {
    const network = NetworksEnum.mainnet
    const stubLogger = sandbox.stub(logger, 'verbose')
    const event = {
      args: {
        daoURI: 'test',
      },
    }

    const addURIUpdatesStub = sandbox.stub()
    const findExistingLogStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').returns(false)
    const findByAddressStub = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns({
      addURIUpdates: addURIUpdatesStub,
      address: '0x123',
    })

    await DaoHandler.newURI(
      event as any,
      {
        transactionHash: '0x123',
        blockNumber: 1,
        address: '0x456',
      },
      network,
    )

    expect(stubLogger.callCount).to.be.eq(2)
    expect(findExistingLogStub.calledOnce).to.be.true
    expect(addURIUpdatesStub.calledOnce).to.be.true
    expect(findByAddressStub.calledOnce).to.be.true

    expect(addURIUpdatesStub.args[0][0]).to.be.deep.eq({
      blockNumber: 1,
      transactionHash: '0x123',
      uri: 'test',
    })
  })
})
