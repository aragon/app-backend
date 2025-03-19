import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import { Interface } from 'ethers'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

describe('AragonTransactions: BlockHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('processNewBlock', () => {
    let stubLoggerError: sinon.SinonStub
    let stubGetProvider: sinon.SinonStub
    let stubGetBlockReceipts: sinon.SinonStub
    let stubCheckIfDepositEvents: sinon.SinonStub
    let stubProcessReceiver: sinon.SinonStub

    beforeEach(() => {
      stubLoggerError = sandbox.stub(logger, 'error')
      stubGetProvider = sandbox.stub(ProviderModule, 'getAnyRpcProvider')
      stubGetBlockReceipts = sandbox.stub(Web3Helper, 'getBlockReceipts')
      stubCheckIfDepositEvents = sandbox.stub(BlockHandler as any, '_checkIfDepositEvents').resolves()
      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver').resolves()
    })

    it('should do nothing if block has no transactions', async () => {
      const fakeBlock = { number: 123, transactions: [] }
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubGetProvider.called).to.be.false
      expect(stubLoggerError.called).to.be.false
      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should log error and return if provider not available', async () => {
      const fakeBlock = { number: 123, transactions: ['0xabc'] }

      stubGetProvider.returns(null)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should return early if blockReceipts is falsy', async () => {
      const fakeBlock = { number: 123, hash: '0xhash', transactions: ['0xabc'] }
      const fakeProvider = { send: stubGetBlockReceipts }
      stubGetBlockReceipts.resolves(null)

      stubGetProvider.returns(fakeProvider)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should wait, check deposit events, and processReceiver if blockReceipts exist', async () => {
      const fakeBlock = {
        number: 123,
        hash: '0xblockHash',
        transactions: ['0xabc', '0xdef'],
      }
      const fakeProvider = { send: stubGetBlockReceipts }
      const fakeReceipts = [
        { to: '0x1111111111111111111111111111111111111111' },
        { to: '0x2222222222222222222222222222222222222222' },
      ]

      stubGetBlockReceipts.resolves(fakeReceipts)
      stubGetProvider.returns(fakeProvider)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubCheckIfDepositEvents.calledOnceWith(fakeReceipts, NetworksEnum.ethereumMainnet)).to.be.true
      expect(stubProcessReceiver.calledOnce).to.be.true
      expect(stubProcessReceiver.firstCall.args[0]).to.equal('0xblockHash')
      expect(stubProcessReceiver.firstCall.args[1]).to.deep.equal([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ])
      expect(stubProcessReceiver.firstCall.args[2]).to.equal(NetworksEnum.ethereumMainnet)
    })
  })

  describe('processReceiver', () => {
    let stubLoggerVerbose: sinon.SinonStub
    let stubLoggerError: sinon.SinonStub
    let stubDaoFind: sinon.SinonStub
    let stubSendDaoMessages: sinon.SinonStub

    beforeEach(() => {
      stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      stubLoggerError = sandbox.stub(logger, 'error')
      // In the actual code: Models.Dao.find({ address: { $in: toAddresses }, network })
      stubDaoFind = sandbox.stub(Models.Dao, 'find')
      stubSendDaoMessages = sandbox.stub(BlockHandler, 'sendDaoMessages')
    })

    it('should do nothing if no DAOs are found', async () => {
      stubDaoFind.resolves([])

      await BlockHandler.processReceiver('0xabc', ['0xdao1', '0xdao2'], NetworksEnum.ethereumMainnet)

      expect(stubDaoFind.calledOnce).to.be.true
      expect(stubLoggerVerbose.called).to.be.false
      expect(stubSendDaoMessages.called).to.be.false
    })

    it('should log and call sendDaoMessages for each found DAO', async () => {
      const fakeDao1 = { address: '0xdao1', network: NetworksEnum.ethereumMainnet }
      const fakeDao2 = { address: '0xdao2', network: NetworksEnum.ethereumMainnet }

      stubDaoFind.resolves([fakeDao1, fakeDao2])
      stubSendDaoMessages.resolves()

      await BlockHandler.processReceiver('0xtransactionHash', ['0xdao1', '0xdao2'], NetworksEnum.ethereumMainnet)

      expect(stubDaoFind.calledOnce).to.be.true
      expect(stubDaoFind.firstCall.args[0]).to.deep.equal({
        address: { $in: ['0xdao1', '0xdao2'] },
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubLoggerVerbose.callCount).to.equal(2)
      expect(stubSendDaoMessages.callCount).to.equal(2)
      expect(stubSendDaoMessages.firstCall.args[0]).to.equal(fakeDao1)
      expect(stubSendDaoMessages.secondCall.args[0]).to.equal(fakeDao2)
      expect(stubLoggerError.called).to.be.false
    })
  })

  describe('_checkIfDepositEvents', () => {
    let stubProcessReceiver: sinon.SinonStub

    let topicHash: string[] = []

    beforeEach(() => {
      topicHash = [
        new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
        new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
      ]

      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver').resolves()
    })

    afterEach(() => {
      sandbox.restore()
    })

    it('should do nothing if logs are empty', async () => {
      const fakeReceipts = [
        {
          transactionHash: '0xhash',
          logs: [
            {
              address: '0xlogaddress',
              topics: ['0x00'],
              transactionHash: '0xhash',
              data: '0x00',
            },
          ],
        },
      ]

      await (BlockHandler as any)._checkIfDepositEvents(fakeReceipts, NetworksEnum.ethereumMainnet)
      expect(stubProcessReceiver.calledOnce).to.be.false
    })

    describe('_decodeTransferLogs', async () => {
      it('should decode ERC20 transfer logs correctly', () => {
        const mockLog = {
          blockNumber: 7737041,
          blockHash: '0xdc9c7656f025e293daf87c59c44558b91e8852d04d2d34f12d73ccd96a81766a',
          transactionIndex: 5,
          removed: false,
          address: '0x4A6c2662808618125f4F9C6d21A441316817b7DA',
          data: '0x000000000000000000000000000000000000000000000000000000000000006a',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x000000000000000000000000707938eeec2af03eb4e61e75180d6ef68b19aabf',
            '0x000000000000000000000000a59978e23c986d8ec6b50ed8f041e9399fa06362',
          ],
          transactionHash: '0x880a304d39c6763dbde588089adee9fa49b5a2a279a9fad1ce8d1c557e92686d',
          logIndex: 0,
        }

        const result = BlockHandler._decodeTransferLogs(mockLog as any)

        expect(result).to.equal('0xa59978e23c986d8Ec6b50eD8F041E9399FA06362')
      })

      it('should decode ERC721 transfer logs if ERC20 fails', () => {
        const mockLog = {
          blockNumber: 21876602,
          blockHash: '0x73d8ecd65c3e7d78bee607f6935decbca736b74664624a21985cc068e9584d1e',
          transactionIndex: 30,
          removed: false,
          address: '0x0a252663DBCc0b073063D6420a40319e438Cfa59',
          data: '0x',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000008459382fd8649d8aab602e5fc96c8cd4132ef12e',
            '0x0000000000000000000000000000000000000000000000000000000000011176',
          ],
          transactionHash: '0xbab828ee01e9840835fef4721b50ccc00a6de7091b30567d944d34f4eba68cc6',
          logIndex: 247,
        }

        const result = BlockHandler._decodeTransferLogs(mockLog as any)

        expect(result).to.equal('0x8459382fD8649D8aab602e5fc96C8cd4132Ef12E')
      })

      it('should decode ERC721 transfer logs if ERC20 fails', () => {
        const mockLog = {
          blockNumber: 21876602,
          blockHash: '0x73d8ecd65c3e7d78bee607f6935decbca736b74664624a21985cc068e9584d1e',
          transactionIndex: 30,
          removed: false,
          address: '0x0a252663DBCc0b073063D6420a40319e438Cfa59',
          data: '0x',
          topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
          transactionHash: '0xbab828ee01e9840835fef4721b50ccc00a6de7091b30567d944d34f4eba68cc6',
          logIndex: 247,
        }

        const result = BlockHandler._decodeTransferLogs(mockLog as any)

        expect(result).to.be.null
      })
    })

    it('should do nothing if logs are empty', async () => {
      const fakeBlock = []
      await BlockHandler._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubProcessReceiver.calledOnce).to.be.false
    })

    it('should call processReceiver for transfer events', async () => {
      const fakeReceipts = [
        {
          transactionHash: '0xhash',
          logs: [
            {
              address: '0xlogaddress',
              topics: [topicHash[1], '0xsender', '0xreceiver'],
              transactionHash: '0xhash',
              data: '0x00',
            },
          ],
        },
      ]

      const stubDecode = sandbox.stub(BlockHandler, '_decodeTransferLogs').returns('0xreceiver')

      await (BlockHandler as any)._checkIfDepositEvents(fakeReceipts, NetworksEnum.ethereumMainnet)

      expect(stubDecode.calledOnce).to.be.true
      expect(stubProcessReceiver.calledOnceWith('0xhash', ['0xreceiver'], NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should call processReceiver for each log found for native token deposit', async () => {
      const logs = [
        { transactionHash: '0xabc', address: '0x123', topics: [topicHash[0]] },
        { transactionHash: '0xdef', address: '0x456', topics: [topicHash[0]] },
      ]

      const receipts = [
        {
          transactionHash: '0xabc',
          logs: [logs[0]],
        },
        {
          transactionHash: '0xdef',
          logs: [logs[1]],
        },
      ]

      await (BlockHandler as any)._checkIfDepositEvents(receipts, NetworksEnum.ethereumMainnet)
      expect(stubProcessReceiver.calledOnceWith('0xabc', ['0x123', '0x456'], NetworksEnum.ethereumMainnet))
    })
  })

  describe('sendDaoMessages', () => {
    let stubLoggerInfo: sinon.SinonStub
    let stubLoggerError: sinon.SinonStub
    let stubRabbitSend: sinon.SinonStub

    beforeEach(() => {
      stubLoggerInfo = sandbox.stub(logger, 'info')
      stubLoggerError = sandbox.stub(logger, 'error')
      stubRabbitSend = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    })

    it('should send all messages successfully', async () => {
      const fakeDao: Dao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      } as Dao

      await BlockHandler.sendDaoMessages(fakeDao)

      expect(stubRabbitSend.calledThrice).to.be.true

      expect(stubRabbitSend.firstCall.args[0]).to.equal('dao.transactions')
      expect(stubRabbitSend.firstCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubRabbitSend.secondCall.args[0]).to.equal('dao.assets')
      expect(stubRabbitSend.secondCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubRabbitSend.thirdCall.args[0]).to.equal('dao.metrics')
      expect(stubRabbitSend.thirdCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubLoggerError.called).to.be.false
    })
  })
})
