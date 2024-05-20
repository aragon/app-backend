import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogMember, IEventLogPluginType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'

describe('Indexer: MemberHandler', () => {
  let sandbox: SinonSandbox
  let plugin: any
  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'

    let rawLogPluginSetupProcessor = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      event: IEventLogPluginType.InstallationApplied,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      preparedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
      appliedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5402',
      pluginSetupRepo: '0x17366cae2b9c6c3055e9e3c78936a69006be5403',
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
      sender: '0x17366cae2b9c6c3055e9e3c78936a69006be5405',
      tokenAddress: '0x17366cae2b9c6c3025e9e3c78936a69006be5406',
      release: '1',
      build: '2',
      permissions: [
        {
          operation: 1,
          where: 'some-where',
          who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
          condition: 'some-conditions',
          permissionId: 'xxx',
        },
      ],
    }

    plugin = await Models.LogPluginSetupProcessor.create(rawLogPluginSetupProcessor)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('membersAdded', () => {
    it('Should handle member added', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogSpy = sandbox.spy(Models.LogMember, 'findByTxHash')

      const fakeLog = {
        name: IEventLogMember.MembersAdded,
        args: {
          members: ['0xmember1', '0xmember2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      const findByPluginAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findByPluginAddress')

      await MemberHandler.membersAdded(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogSpy.calledOnce).to.be.true
      expect(findByPluginAddressSpy.calledOnce).to.be.true

      const logMember = await Models.LogMember.find({ transactionHash: txLog.transactionHash })

      expect(logMember).to.be.not.null
      expect(logMember.length).to.be.eq(2)

      expect(logMember[0].address).to.be.eq('0xmember1')
      expect(logMember[1].address).to.be.eq('0xmember2')
    })

    it('should return true if log already exists', async () => {
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findByTxHash').resolves(true)

      const fakeLog = {
        name: IEventLogMember.MembersAdded,
        args: {
          members: ['member1', 'member2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      const findByPluginAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findByPluginAddress')

      await MemberHandler.membersAdded(fakeLog, txLog, NetworksEnum.mainnet)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByPluginAddressSpy.notCalled).to.be.true
    })

    it('should return if the plugin is not found', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findByTxHash').resolves(false)
      const findByPluginAddressStub = sandbox
        .stub(Models.LogPluginSetupProcessor, 'findByPluginAddress')
        .resolves(false)

      const fakeLog = {
        name: IEventLogMember.MembersAdded,
        args: {
          members: ['member1', 'member2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      await MemberHandler.membersAdded(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByPluginAddressStub.calledOnce).to.be.true
    })
  })

  describe('membersRemoved', () => {
    it('should handle member removed', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogSpy = sandbox.spy(Models.LogMember, 'findByTxHash')

      const fakeLog = {
        name: IEventLogMember.MembersRemoved,
        args: {
          members: ['member1', 'member2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      const findByPluginAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findByPluginAddress')

      await MemberHandler.membersRemoved(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogSpy.calledOnce).to.be.true
      expect(findByPluginAddressSpy.calledOnce).to.be.true

      const logMember = await Models.LogMember.find({ transactionHash: txLog.transactionHash })
      expect(logMember).to.be.not.null
      expect(logMember.length).to.be.eq(2)

      expect(logMember[0].address).to.be.eq('member1')
      expect(logMember[1].address).to.be.eq('member2')
    })

    it('fails if tx is already processed', async () => {
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findByTxHash').resolves(true)

      const fakeLog = {
        name: IEventLogMember.MembersRemoved,
        args: {
          members: ['member1', 'member2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      const findByPluginAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findByPluginAddress')

      await MemberHandler.membersRemoved(fakeLog, txLog, NetworksEnum.mainnet)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByPluginAddressSpy.notCalled).to.be.true
    })

    it('fails if plugin is not found', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findByTxHash').resolves(false)
      const findByPluginAddressStub = sandbox
        .stub(Models.LogPluginSetupProcessor, 'findByPluginAddress')
        .resolves(false)

      const fakeLog = {
        name: IEventLogMember.MembersRemoved,
        args: {
          members: ['member1', 'member2'],
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.pluginAddress,
      }

      await MemberHandler.membersRemoved(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByPluginAddressStub.calledOnce).to.be.true
    })
  })

  describe('delegateChanged', () => {
    it('should handle delegate changed', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')

      const fakeLog = {
        name: IEventLogMember.DelegateChanged,
        args: {
          fromDelegate: '0xfromDelegate',
          toDelegate: '0xtoDelegate',
          delegator: '0xdelegator',
        },
      } as any

      const deletageVotChangedLog = {
        name: IEventLogMember.DelegateVotesChanged,
        args: {
          previousBalance: '0x123',
          newBalance: '0x456',
        },
      }

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.tokenAddress,
      }

      sandbox.stub(Web3, 'getTransactionReceipt').resolves({
        logs: true,
      } as any)

      sandbox.stub(Web3, 'findLogsByName').returns({
        parsed: deletageVotChangedLog,
      } as any)

      const findExistingLogStub = sandbox.spy(Models.LogMember, 'findExistingLog')

      const findPluginByTokenAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findPluginByTokenAddress')

      await MemberHandler.delegateChanged(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findPluginByTokenAddressSpy.calledOnce).to.be.true

      const logMember = await Models.LogMember.findOne({ transactionHash: txLog.transactionHash })

      expect(logMember).to.be.not.null
      expect(logMember.address).to.be.eq('0xtoDelegate')
    })

    it('should return if the tx is already processed', async () => {
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findExistingLog').resolves(true)

      sandbox.stub(Web3, 'getTransactionReceipt').resolves({
        logs: true,
      } as any)

      const fakeLog = {
        name: IEventLogMember.DelegateChanged,
        args: {
          fromDelegate: '0xfromDelegate',
          toDelegate: '0xtoDelegate',
          delegator: '0xdelegator',
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.tokenAddress,
      }

      const findPluginByTokenAddressSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findPluginByTokenAddress')

      await MemberHandler.delegateChanged(fakeLog, txLog, NetworksEnum.mainnet)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findPluginByTokenAddressSpy.notCalled).to.be.true
    })

    it('should return if the plugin is not found', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findExistingLog').resolves(false)
      const findPluginByTokenAddressStub = sandbox
        .stub(Models.LogPluginSetupProcessor, 'findPluginByTokenAddress')
        .resolves(false)

      sandbox.stub(Web3, 'getTransactionReceipt').resolves({
        logs: true,
      } as any)

      const fakeLog = {
        name: IEventLogMember.DelegateChanged,
        args: {
          fromDelegate: '0xfromDelegate',
          toDelegate: '0xtoDelegate',
          delegator: '0xdelegator',
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.tokenAddress,
      }

      const findLogsByNameSpy = sandbox.spy(Web3, 'findLogsByName')

      await MemberHandler.delegateChanged(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findPluginByTokenAddressStub.calledOnce).to.be.true
      expect(findLogsByNameSpy.notCalled).to.be.true
    })

    it('should return if the DelegateVotesChanged log is not found', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const findExistingLogStub = sandbox.stub(Models.LogMember, 'findExistingLog').resolves(false)
      const findPluginByTokenAddressStub = sandbox
        .stub(Models.LogPluginSetupProcessor, 'findPluginByTokenAddress')
        .resolves(true)

      sandbox.stub(Web3, 'getTransactionReceipt').resolves({
        logs: true,
      } as any)

      const fakeLog = {
        name: IEventLogMember.DelegateChanged,
        args: {
          fromDelegate: '0xfromDelegate',
          toDelegate: '0xtoDelegate',
          delegator: '0xdelegator',
        },
      } as any

      const txLog = {
        transactionHash: '0x0123123',
        blockNumber: 3,
        address: plugin.tokenAddress,
      }

      const findLogsByNameSpy = sandbox.spy(Web3, 'findLogsByName')

      const createSpy = sandbox.spy(Models.LogMember, 'create')

      await MemberHandler.delegateChanged(fakeLog, txLog, NetworksEnum.mainnet)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findPluginByTokenAddressStub.calledOnce).to.be.true
      expect(findLogsByNameSpy.calledOnce).to.be.true
      expect(createSpy.notCalled).to.be.true
    })
  })
})
