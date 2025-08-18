import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogMember, IEventLogPluginType, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MultisigHandler } from '@handlers/multisigHandler'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@src/governance'

describe('Indexer: MultisigHandler', () => {
  let sandbox: SinonSandbox
  let plugin: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'

    let rawPlugin = {
      transactionHash,
      interfaceType: IPluginInterfaceType.tokenVoting,
      blockNumber: 3,
      transactionIndex: 1,
      logIndex: 1,
      network: NetworksEnum.ethereumMainnet,
      event: IEventLogPluginType.InstallationApplied,
      status: IPluginStatus.installed,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      preparedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
      appliedSetupId: '0x17366cae2b9c6c3055e9e3c78936a69006be5402',
      pluginSetupRepo: '0x17366cae2b9c6c3055e9e3c78936a69006be5403',
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
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

    plugin = await Models.Plugin.create(rawPlugin)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('membersAdded', () => {
    it('Should handle member added', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: plugin.address,
        eventName: IEventLogMember.MembersAdded,
      }
      const fakeLog = {
        name: IEventLogMember.MembersAdded,
        args: {
          members: ['0x52Af16664155608b845BE18aa29620EbF6eA2D3a', '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'],
        },
      } as any

      const findByPluginAddressSpy = sandbox.spy(Models.Plugin, 'findByAddress')
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({}),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      await MultisigHandler.membersAdded(fakeLog, logInfo)

      expect(findByPluginAddressSpy.calledOnce).to.be.true
      expect(factoryStub.calledOnce).to.be.true
      expect(factoryStub.firstCall.args[0]).to.deep.equal({
        address: plugin.address,
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
      })
      expect(mockGovernance.getOrCreate.calledTwice).to.be.true
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true
    })

    it('should return if the plugin is not found', async () => {
      const verboseStub = sandbox.stub(logger, 'warn')
      const findByPluginAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: plugin.address,
        eventName: IEventLogMember.MembersAdded,
      }
      const fakeLog = {
        name: IEventLogMember.MembersAdded,
        args: {
          members: ['0x52Af16664155608b845BE18aa29620EbF6eA2D3a', '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'],
        },
      } as any

      await MultisigHandler.membersAdded(fakeLog, logInfo)

      expect(verboseStub.callCount).to.be.eq(1)
      expect(findByPluginAddressStub.calledOnce).to.be.true
    })
  })

  describe('membersRemoved', () => {
    it('should handle member removed', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: plugin.address,
        eventName: IEventLogMember.MembersRemoved,
      }
      const fakeLog = {
        name: IEventLogMember.MembersRemoved,
        args: {
          members: ['0x52Af16664155608b845BE18aa29620EbF6eA2D3a', '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'],
        },
      } as any

      const findByPluginAddressSpy = sandbox.spy(Models.Plugin, 'findByAddress')
      const mockGovernance = {
        delete: sandbox.stub().resolves(true),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      await MultisigHandler.membersRemoved(fakeLog, logInfo)

      expect(findByPluginAddressSpy.calledOnce).to.be.true
      expect(factoryStub.calledOnce).to.be.true
      expect(factoryStub.firstCall.args[0]).to.deep.equal({
        address: plugin.address,
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
      })
      expect(mockGovernance.delete.calledTwice).to.be.true
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true
    })

    it('fails if plugin is not found', async () => {
      const loggerStub = sandbox.stub(logger, 'warn')
      const findByPluginAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: plugin.address,
        eventName: IEventLogMember.MembersRemoved,
      }
      const fakeLog = {
        name: IEventLogMember.MembersRemoved,
        args: {
          members: ['0x52Af16664155608b845BE18aa29620EbF6eA2D3a', '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'],
        },
      } as any

      await MultisigHandler.membersRemoved(fakeLog, logInfo)

      expect(loggerStub.callCount).to.be.eq(1)
      expect(findByPluginAddressStub.calledOnce).to.be.true
    })
  })
})
