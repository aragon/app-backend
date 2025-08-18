import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import {
  MemberGovernanceFactory,
  BaseGovernance,
  Erc20Governance,
  VeGovernance,
  LockToVoteGovernance,
  MultisigGovernance,
  AdminGovernance,
} from '@src/governance'
import { NetworksEnum, IPluginInterfaceType, ITokenType, type HexAddress } from '@types'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'

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

      it('should throw error for gauge interface type', () => {
        expect(() => {
          MemberGovernanceFactory.create({
            address: testAddress,
            network: testNetwork,
            interfaceType: IPluginInterfaceType.gauge,
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
