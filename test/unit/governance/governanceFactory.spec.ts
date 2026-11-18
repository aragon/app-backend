import '@test/environment'
import { Models } from '@dbModels'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import DbTx from '@modules/dbTx'
import {
  AdminGovernance,
  BaseGovernance,
  CapitalDistributorGovernance,
  Erc20Governance,
  GaugeGovernance,
  LockToVoteGovernance,
  MemberGovernanceFactory,
  MultisigGovernance,
  VeGovernance,
} from '@src/governance'
import { type HexAddress, IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Governance:GovernanceFactory', () => {
  let sandbox: SinonSandbox
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  const testAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const escrowAdapterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as HexAddress

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerErrorStub = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('create', () => {
    describe('tokenVoting interface type', () => {
      it('should create VeGovernance for escrowAdapter token type', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
        })

        expect(result).to.be.instanceOf(VeGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should create VeGovernance with extraParams for escrowAdapter token type', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
          extraParams: {
            escrowAdapterAddress: escrowAdapterAddress,
          },
        })

        expect(result).to.be.instanceOf(VeGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
        expect(result?.['escrowAdapterAddress']).to.equal(escrowAdapterAddress)
      })

      it('should create Erc20Governance for other token types', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.ERC20,
        })

        expect(result).to.be.instanceOf(Erc20Governance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should create Erc20Governance when no token type provided', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
        })

        expect(result).to.be.instanceOf(Erc20Governance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should create Erc20Governance for erc721 token type', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.ERC721,
        })

        expect(result).to.be.instanceOf(Erc20Governance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should create Erc20Governance for erc1155 token type', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.ERC1155,
        })

        expect(result).to.be.instanceOf(Erc20Governance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('lockToVote interface type', () => {
      it('should create LockToVoteGovernance', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.lockToVote,
        })

        expect(result).to.be.instanceOf(LockToVoteGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('multisig interface type', () => {
      it('should create MultisigGovernance', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.multisig,
        })

        expect(result).to.be.instanceOf(MultisigGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('admin interface type', () => {
      it('should create AdminGovernance', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.admin,
        })

        expect(result).to.be.instanceOf(AdminGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('capitalDistributor interface type', () => {
      it('should create CapitalDistributorGovernance', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.capitalDistributor,
        })

        expect(result).to.be.instanceOf(CapitalDistributorGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('gauge interface type', () => {
      it('should create GaugeGovernance', () => {
        const result = MemberGovernanceFactory.create({
          address: testAddress,
          network: testNetwork,
          interfaceType: IPluginInterfaceType.gauge,
        })

        expect(result).to.be.instanceOf(GaugeGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('unsupported interface types', () => {
      it('should throw error for spp interface type', () => {
        expect(() => {
          MemberGovernanceFactory.create({
            address: testAddress,
            network: testNetwork,
            interfaceType: IPluginInterfaceType.spp,
          })
        }).to.throw('Unsupported plugin interface type')

        expect(loggerWarnStub.calledWith('Unsupported plugin interface type, returning null')).to.be.true
      })

      it('should throw error for unknown interface type', () => {
        expect(() => {
          MemberGovernanceFactory.create({
            address: testAddress,
            network: testNetwork,
            interfaceType: IPluginInterfaceType.unknown,
          })
        }).to.throw('Unsupported plugin interface type')

        expect(loggerWarnStub.calledWith('Unsupported plugin interface type, returning null')).to.be.true
      })

      it('should throw error for undefined interface type', () => {
        expect(() => {
          MemberGovernanceFactory.create({
            address: testAddress,
            network: testNetwork,
            interfaceType: 'invalid' as any,
          })
        }).to.throw('Unsupported plugin interface type')

        expect(loggerWarnStub.calledWith('Unsupported plugin interface type, returning null')).to.be.true
      })
    })
  })

  describe('createFromPlugin', () => {
    const createPlugin = (overrides = {}) => ({
      address: testAddress,
      network: testNetwork,
      interfaceType: IPluginInterfaceType.multisig,
      ...overrides,
    })

    describe('tokenVoting plugins', () => {
      it('should create VeGovernance for plugin with votingEscrow', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.tokenVoting,
          votingEscrow: {
            escrowAddress: testAddress,
          },
          tokenAddress: escrowAdapterAddress,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(VeGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
        expect(result?.['escrowAdapterAddress']).to.equal(escrowAdapterAddress)
      })

      it('should create Erc20Governance for plugin with tokenAddress', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenAddress: testAddress,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(Erc20Governance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should throw error for tokenVoting plugin without tokenAddress or votingEscrow', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.tokenVoting,
        })

        expect(() => {
          MemberGovernanceFactory.createFromPlugin(plugin as any)
        }).to.throw('Unsupported plugin interface type: tokenVoting')

        expect(loggerWarnStub.calledWith('Unable to create governance from plugin')).to.be.true
      })
    })

    describe('lockToVote plugins', () => {
      it('should create LockToVoteGovernance for plugin with lockManagerAddress', () => {
        const lockManagerAddress = '0xdeadbeef' as HexAddress
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.lockToVote,
          lockManagerAddress,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(LockToVoteGovernance)
        expect(result?.['address']).to.equal(lockManagerAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })

      it('should create LockToVoteGovernance even without lockManagerAddress (uses undefined)', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.lockToVote,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(LockToVoteGovernance)
        expect(result?.['address']).to.equal(undefined)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('multisig plugins', () => {
      it('should create MultisigGovernance for multisig plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.multisig,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(MultisigGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('admin plugins', () => {
      it('should create AdminGovernance for admin plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.admin,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(AdminGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('capitalDistributor plugins', () => {
      it('should create CapitalDistributorGovernance for capitalDistributor plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.capitalDistributor,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(CapitalDistributorGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('gauge plugins', () => {
      it('should create GaugeGovernance for gauge plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.gauge,
        })

        const result = MemberGovernanceFactory.createFromPlugin(plugin as any)

        expect(result).to.be.instanceOf(GaugeGovernance)
        expect(result?.['address']).to.equal(testAddress)
        expect(result?.['network']).to.equal(testNetwork)
      })
    })

    describe('unsupported plugins', () => {
      it('should throw error for spp plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.spp,
        })

        expect(() => {
          MemberGovernanceFactory.createFromPlugin(plugin as any)
        }).to.throw('Unsupported plugin interface type: spp')

        expect(loggerWarnStub.calledWith('Unable to create governance from plugin')).to.be.true
      })

      it('should throw error for unknown plugin', () => {
        const plugin = createPlugin({
          interfaceType: IPluginInterfaceType.unknown,
        })

        expect(() => {
          MemberGovernanceFactory.createFromPlugin(plugin as any)
        }).to.throw('Unsupported plugin interface type: unknown')

        expect(loggerWarnStub.calledWith('Unable to create governance from plugin')).to.be.true
      })
    })
  })

  describe('findPluginsOfMember', () => {
    const polygon = NetworksEnum.polygonMainnet
    const member = '0x4444444444444444444444444444444444444444' as HexAddress
    const dao = '0x5555555555555555555555555555555555555555' as HexAddress
    const otherDao = '0x6666666666666666666666666666666666666666' as HexAddress
    const token = '0x7777777777777777777777777777777777777777' as HexAddress
    const escrowAdapter = '0x8888888888888888888888888888888888888888' as HexAddress
    const lockManager = '0x9999999999999999999999999999999999999999' as HexAddress
    const TOKEN_VOTING = '0x1000000000000000000000000000000000000001' as HexAddress
    const VE_VOTING = '0x1000000000000000000000000000000000000002' as HexAddress
    const LOCK_TO_VOTE = '0x1000000000000000000000000000000000000003' as HexAddress
    const MULTISIG = '0x1000000000000000000000000000000000000004' as HexAddress
    const ADMIN = '0x1000000000000000000000000000000000000005' as HexAddress

    const addPlugin = (address: HexAddress, interfaceType: IPluginInterfaceType, overrides: Record<string, any> = {}) =>
      Models.Plugin.create({
        address,
        daoAddress: dao,
        network: testNetwork,
        transactionHash: `0x${address.slice(-2).repeat(32)}`,
        blockNumber: 1,
        interfaceType,
        status: IPluginStatus.installed,
        isSupported: true,
        ...overrides,
      })

    const addPluginMember = (pluginAddress: HexAddress, network = testNetwork) =>
      Models.PluginMember.create({ memberAddress: member, pluginAddress, daoAddress: dao, network })

    it('matches a voting token, a ve lock, a lock manager and a member list to their plugins', async () => {
      await addPlugin(TOKEN_VOTING, IPluginInterfaceType.tokenVoting, { tokenAddress: token })
      await Models.TokenMember.create({
        memberAddress: member,
        tokenAddress: token,
        network: testNetwork,
        votingPower: '1',
      })
      await addPlugin(VE_VOTING, IPluginInterfaceType.tokenVoting, {
        tokenAddress: escrowAdapter,
        votingEscrow: { escrowAddress: testAddress },
      })
      await Models.Lock.create({
        network: testNetwork,
        escrowAddress: testAddress,
        transactionHash: '0xlocktx',
        transactionIndex: 0,
        logIndex: 0,
        memberAddress: member,
        nftAddress: '0xnftaddress',
        tokenAddress: escrowAdapter,
        exitQueueAddress: '0xexitqueueaddress',
        tokenId: '1',
        delegateReceiverAddress: member,
      })
      await addPlugin(LOCK_TO_VOTE, IPluginInterfaceType.lockToVote, { lockManagerAddress: lockManager })
      await Models.LockToVoteMember.create({
        memberAddress: member,
        lockManagerAddress: lockManager,
        network: testNetwork,
        votingPower: '1',
      })
      await addPlugin(MULTISIG, IPluginInterfaceType.multisig)
      await addPluginMember(MULTISIG)
      await addPlugin(ADMIN, IPluginInterfaceType.admin)
      await addPluginMember(ADMIN)

      const result = await MemberGovernanceFactory.findPluginsOfMember(member)

      expect(
        result.map(plugin => ({ address: plugin.address, network: plugin.network, daoAddress: plugin.daoAddress })),
      ).to.have.deep.members(
        [TOKEN_VOTING, VE_VOTING, LOCK_TO_VOTE, MULTISIG, ADMIN].map(address => ({
          address,
          network: testNetwork,
          daoAddress: dao,
        })),
      )
    })

    it('returns only installed, supported plugins, and a member list only for a multisig or admin plugin', async () => {
      await addPlugin(MULTISIG, IPluginInterfaceType.multisig)
      await addPluginMember(MULTISIG)
      await addPlugin(ADMIN, IPluginInterfaceType.admin, { status: IPluginStatus.uninstalled })
      await addPluginMember(ADMIN)
      await addPlugin(TOKEN_VOTING, IPluginInterfaceType.multisig, { isSupported: false })
      await addPluginMember(TOKEN_VOTING)
      await addPlugin(LOCK_TO_VOTE, IPluginInterfaceType.gauge)
      await addPluginMember(LOCK_TO_VOTE)

      const result = await MemberGovernanceFactory.findPluginsOfMember(member)

      expect(result.map(plugin => plugin.address)).to.deep.equal([MULTISIG])
    })

    it('narrows the plugins by the network filter and by the plugin filter', async () => {
      await addPlugin(MULTISIG, IPluginInterfaceType.multisig)
      await addPluginMember(MULTISIG)
      await addPlugin(ADMIN, IPluginInterfaceType.admin, { daoAddress: otherDao })
      await addPluginMember(ADMIN)
      await addPlugin(TOKEN_VOTING, IPluginInterfaceType.multisig, { network: polygon })
      await addPluginMember(TOKEN_VOTING, polygon)

      const everywhere = await MemberGovernanceFactory.findPluginsOfMember(member)
      const onOneNetwork = await MemberGovernanceFactory.findPluginsOfMember(member, { network: testNetwork })
      const inOneDao = await MemberGovernanceFactory.findPluginsOfMember(member, {}, { daoAddress: otherDao })

      expect(everywhere.map(plugin => plugin.address)).to.have.members([MULTISIG, ADMIN, TOKEN_VOTING])
      expect(onOneNetwork.map(plugin => plugin.address)).to.have.members([MULTISIG, ADMIN])
      expect(inOneDao.map(plugin => plugin.address)).to.deep.equal([ADMIN])
    })

    it('returns only the plugins of the member when the plugin filter brings its own $or', async () => {
      await addPlugin(MULTISIG, IPluginInterfaceType.multisig)
      await addPluginMember(MULTISIG)
      await addPlugin(ADMIN, IPluginInterfaceType.admin, { daoAddress: otherDao })

      const result = await MemberGovernanceFactory.findPluginsOfMember(
        member,
        {},
        { $or: [{ daoAddress: dao }, { daoAddress: otherDao }] },
      )

      expect(result.map(plugin => plugin.address)).to.deep.equal([MULTISIG])
    })

    it('returns no plugin for a wallet with no membership', async () => {
      await addPlugin(MULTISIG, IPluginInterfaceType.multisig)

      const result = await MemberGovernanceFactory.findPluginsOfMember(member)

      expect(result).to.deep.equal([])
    })
  })

  describe('createBaseMember', () => {
    let parseAddressStub: sinon.SinonStub
    let executeTxFnStub: sinon.SinonStub
    let ensureBaseMemberStub: sinon.SinonStub
    let sessionStub: any

    beforeEach(() => {
      parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn')
      ensureBaseMemberStub = sandbox.stub(BaseGovernance, 'ensureBaseMember')

      sessionStub = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }
    })

    it('should return null for invalid address', async () => {
      parseAddressStub.returns(null)

      const result = await MemberGovernanceFactory.createBaseMember('invalid' as HexAddress)

      expect(result).to.be.null
      expect(parseAddressStub.calledWith('invalid')).to.be.true
      expect(executeTxFnStub.called).to.be.false
    })

    it('should create base member successfully', async () => {
      const mockMember = { address: testAddress, id: '123' }
      parseAddressStub.returns(testAddress)

      executeTxFnStub.callsFake(async fn => {
        return await fn({ session: sessionStub })
      })

      ensureBaseMemberStub.resolves(mockMember)

      const result = await MemberGovernanceFactory.createBaseMember(testAddress, 100)

      expect(result).to.equal(mockMember)
      expect(parseAddressStub.calledWith(testAddress)).to.be.true
      expect(ensureBaseMemberStub.calledWith(testAddress, 100, sessionStub)).to.be.true
      expect(sessionStub.commitTransaction.called).to.be.true
      expect(sessionStub.endSession.called).to.be.true
    })

    it('should create base member without lastActivity', async () => {
      const mockMember = { address: testAddress, id: '123' }
      parseAddressStub.returns(testAddress)

      executeTxFnStub.callsFake(async fn => {
        return await fn({ session: sessionStub })
      })

      ensureBaseMemberStub.resolves(mockMember)

      const result = await MemberGovernanceFactory.createBaseMember(testAddress)

      expect(result).to.equal(mockMember)
      expect(parseAddressStub.calledWith(testAddress)).to.be.true
      expect(ensureBaseMemberStub.calledWith(testAddress, undefined, sessionStub)).to.be.true
      expect(sessionStub.commitTransaction.called).to.be.true
      expect(sessionStub.endSession.called).to.be.true
    })

    it('should handle case when ensureBaseMember returns null', async () => {
      parseAddressStub.returns(testAddress)

      executeTxFnStub.callsFake(async fn => {
        return await fn({ session: sessionStub })
      })

      ensureBaseMemberStub.resolves(null)

      const result = await MemberGovernanceFactory.createBaseMember(testAddress)

      expect(result).to.be.null
      expect(parseAddressStub.calledWith(testAddress)).to.be.true
      expect(ensureBaseMemberStub.calledWith(testAddress, undefined, sessionStub)).to.be.true
      expect(sessionStub.commitTransaction.called).to.be.false
      expect(sessionStub.endSession.called).to.be.false
    })

    it('should handle errors and return null', async () => {
      const error = new Error('Database error')
      parseAddressStub.returns(testAddress)
      executeTxFnStub.rejects(error)

      const result = await MemberGovernanceFactory.createBaseMember(testAddress, 100)

      expect(result).to.be.null
      expect(parseAddressStub.calledWith(testAddress)).to.be.true
      expect(loggerErrorStub.calledWith('Error creating base member')).to.be.true
    })
  })
})
