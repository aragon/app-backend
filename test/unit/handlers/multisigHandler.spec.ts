import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import {
  EnumQueueName,
  IEventLogMember,
  IEventLogPluginType,
  IPluginInterfaceType,
  IPluginStatus,
  NetworksEnum,
} from '@types'
import { beforeEach } from 'mocha'
import { MultisigHandler } from '@handlers/multisigHandler'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Indexer: MemberHandler', () => {
  let sandbox: SinonSandbox
  let plugin: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'

    let rawPlugin = {
      transactionHash,
      interfaceType: IPluginInterfaceType.multisig,
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
      const addToDaoStub = sandbox.spy(ProxyMember, 'addToDao')
      const stubRaddit = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await MultisigHandler.membersAdded(fakeLog, logInfo)

      expect(findByPluginAddressSpy.calledOnce).to.be.true
      expect(addToDaoStub.calledTwice).to.be.true

      expect(addToDaoStub.firstCall.args[0]).to.deep.equal({
        memberAddress: '0x52Af16664155608b845BE18aa29620EbF6eA2D3a',
        pluginAddress: plugin.address,
        network: NetworksEnum.ethereumMainnet,
      })
      expect(addToDaoStub.secondCall.args[0]).to.deep.equal({
        memberAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
        pluginAddress: plugin.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubRaddit.calledTwice).to.be.true

      expect(stubRaddit.args[0][0]).to.be.eq(EnumQueueName.daoMetrics)
      expect(stubRaddit.args[0][1].id).to.be.eq(plugin.daoAddress)
      expect(stubRaddit.args[1][0]).to.be.eq(EnumQueueName.daoMetrics)
      expect(stubRaddit.args[1][1].id).to.be.eq(plugin.daoAddress)
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
      const removeFromDaoStub = sandbox.spy(ProxyMember, 'removeFromDao')
      const stubRaddit = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await MultisigHandler.membersRemoved(fakeLog, logInfo)

      expect(findByPluginAddressSpy.calledOnce).to.be.true
      expect(removeFromDaoStub.calledTwice).to.be.true

      expect(removeFromDaoStub.firstCall.args[0]).to.deep.equal({
        memberAddress: '0x52Af16664155608b845BE18aa29620EbF6eA2D3a',
        pluginAddress: plugin.address,
        network: NetworksEnum.ethereumMainnet,
      })
      expect(removeFromDaoStub.secondCall.args[0]).to.deep.equal({
        memberAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
        pluginAddress: plugin.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubRaddit.calledTwice).to.be.true

      expect(stubRaddit.args[0][0]).to.be.eq(EnumQueueName.daoMetrics)
      expect(stubRaddit.args[0][1].id).to.be.eq(plugin.daoAddress)
      expect(stubRaddit.args[1][0]).to.be.eq(EnumQueueName.daoMetrics)
      expect(stubRaddit.args[1][1].id).to.be.eq(plugin.daoAddress)
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
