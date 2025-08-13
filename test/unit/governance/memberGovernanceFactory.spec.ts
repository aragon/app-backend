import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Logger from '@logger'
import {
  MemberGovernanceFactory,
  Erc20Governance,
  VeGovernance,
  LockToVoteGovernance,
  MultisigGovernance,
  AdminGovernance,
} from '@src/governance'
import { NetworksEnum, IPluginInterfaceType, ITokenType, type HexAddress } from '@types'

describe('Modules:MemberGovernance:MemberGovernanceFactory', () => {
  let sandbox: SinonSandbox
  let loggerWarnStub: sinon.SinonStub

  const testAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerWarnStub = sandbox.stub(Logger, 'warn')
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
})
