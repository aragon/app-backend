import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import EnsHelper from '@helpers/ens'
import { NetworksEnum } from '@types'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:ProxyMember', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('createMember', () => {
    it('should create a new member with lastActivity', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const lastActivity = 1680000000

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(null)
      const getEnsWithUniversalResolverStub = sandbox
        .stub(EnsHelper, 'getEnsWithUniversalResolver')
        .resolves('louis.eth' as any)

      const createdMember = await ProxyMember.createMember(parsedMemberAddress, lastActivity)

      expect(createdMember).to.be.an('object')
      expect(createdMember?.address).to.equal(parsedMemberAddress)
      expect(createdMember?.ens).to.equal('louis.eth')
      expect(createdMember?.firstActivity).to.equal(lastActivity)
      expect(createdMember?.lastActivity).to.equal(lastActivity)
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
      expect(getEnsWithUniversalResolverStub.calledOnceWith(parsedMemberAddress)).to.be.true
    })

    it('should update existing member lastActivity if provided', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const lastActivity = 1680000000
      const existingMember = {
        address: parsedMemberAddress,
        ens: 'louis.eth',
        firstActivity: 1670000000,
        update: sandbox.stub().resolves({ address: parsedMemberAddress, lastActivity }),
      }

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(existingMember as any)

      const result = await ProxyMember.createMember(parsedMemberAddress, lastActivity)

      expect(result?.lastActivity).to.equal(lastActivity)
      expect(existingMember.update.calledOnceWith({ lastActivity }, sinon.match.any)).to.be.true
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
    })

    it('should update firstActivity if not set on existing member', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const lastActivity = 1680000000
      const existingMember = {
        address: parsedMemberAddress,
        ens: 'louis.eth',
        firstActivity: null,
        update: sandbox.stub().resolves({ address: parsedMemberAddress, lastActivity, firstActivity: lastActivity }),
      }

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(existingMember as any)

      const result = await ProxyMember.createMember(parsedMemberAddress, lastActivity)

      expect(result?.lastActivity).to.equal(lastActivity)
      expect(result?.firstActivity).to.equal(lastActivity)
      expect(existingMember.update.calledOnceWith({ lastActivity, firstActivity: lastActivity }, sinon.match.any)).to.be
        .true
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
    })

    it('should return existing member without updating if no lastActivity provided', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const existingMember = {
        address: parsedMemberAddress,
        ens: 'louis.eth',
      }

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(existingMember as any)

      const result = await ProxyMember.createMember(parsedMemberAddress)

      expect(result).to.deep.equal(existingMember)
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
    })

    it('should handle errors gracefully and return null', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').throws(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.createMember(parsedMemberAddress)

      expect(result).to.be.null
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('getOrCreateVotingPower', () => {
    it('should return existing VpMember if found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const existingVpMember = { id: 'vp-member-id', votingPower: '100' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findExistingLog').resolves(existingVpMember)

      const result = await ProxyMember.getOrCreateVotingPower(params)

      expect(result).to.equal(existingVpMember)
    })

    it('should create new VpMember if not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const newVpMember = { id: 'new-vp-member-id', votingPower: '0' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.VpMember, 'create').resolves(newVpMember)

      const result = await ProxyMember.getOrCreateVotingPower(params)

      expect(result).to.equal(newVpMember)
      expect(
        Models.VpMember.create.calledOnceWith(
          {
            memberAddress: params.memberAddress,
            tokenAddress: params.tokenAddress,
            votingPower: '0',
            tokenIds: [],
            network: params.network,
          },
          sinon.match.any,
        ),
      ).to.be.true
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.getOrCreateVotingPower({
        memberAddress: 'invalid',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findExistingLog').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.getOrCreateVotingPower(params)

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('getOrCreatePluginMember', () => {
    it('should return existing PluginMember if found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }
      const existingPluginMember = { id: 'plugin-member-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findExistingLog').resolves(existingPluginMember)

      const result = await ProxyMember.getOrCreatePluginMember(params)

      expect(result).to.equal(existingPluginMember)
    })

    it('should create new PluginMember if not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }
      const newPluginMember = { id: 'new-plugin-member-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.PluginMember, 'create').resolves(newPluginMember)

      const result = await ProxyMember.getOrCreatePluginMember(params)

      expect(result).to.equal(newPluginMember)
      expect(Models.PluginMember.create.calledOnceWith(params, sinon.match.any)).to.be.true
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.getOrCreatePluginMember({
        memberAddress: 'invalid',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })
  })

  describe('updateVotingPower', () => {
    it('should update voting power successfully', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000' }),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(vpMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.votingPower).to.equal('1000')
      expect(vpMember.update.calledOnceWith({ votingPower: '1000' }, sinon.match.any)).to.be.true
    })

    it('should update tokenIds when provided', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        tokenIds: ['1', '2', '3'],
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000', tokenIds: ['1', '2', '3'] }),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(vpMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.tokenIds).to.deep.equal(['1', '2', '3'])
      expect(vpMember.update.calledOnceWith({ votingPower: '1000', tokenIds: ['1', '2', '3'] }, sinon.match.any)).to.be
        .true
    })

    it('should clear tokenIds when voting power is 0', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '0',
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '0', tokenIds: [] }),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(vpMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.votingPower).to.equal('0')
      expect(vpMember.update.calledOnceWith({ votingPower: '0', tokenIds: [] }, sinon.match.any)).to.be.true
    })

    it('should return null if getOrCreateVotingPower fails', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateVotingPower(params)

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('updateDelegationMetrics', () => {
    it('should update delegation metrics successfully', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = {
        id: 'vp-member-id',
        update: sandbox.stub().resolves({ id: 'vp-member-id', delegateReceivedCount: 5 }),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(vpMember as any)
      sandbox.stub(Models.MemberTransaction, 'getReceiveDelegationCount').resolves(5)

      const result = await ProxyMember.updateDelegationMetrics(params)

      expect(result?.delegateReceivedCount).to.equal(5)
      expect(vpMember.update.calledOnceWith({ delegateReceivedCount: 5 }, sinon.match.any)).to.be.true
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress: 'invalid',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })

    it('should return null if getOrCreateVotingPower fails', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateDelegationMetrics(params)

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('addPluginMember', () => {
    it('should add plugin member successfully', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginMember = { id: 'plugin-member-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(pluginMember as any)

      const result = await ProxyMember.addPluginMember(params)

      expect(result).to.equal(pluginMember)
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.addPluginMember({
        memberAddress: 'invalid',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })
  })

  describe('removePluginMember', () => {
    it('should remove plugin member successfully', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginMember = {
        id: 'plugin-member-id',
        deleteOne: sandbox.stub().resolves(true),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(pluginMember as any)

      const result = await ProxyMember.removePluginMember(params)

      expect(result).to.be.true
      expect(pluginMember.deleteOne.calledOnce).to.be.true
    })

    it('should return false if plugin member not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(null)

      const result = await ProxyMember.removePluginMember(params)

      expect(result).to.be.false
    })

    it('should return false if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.removePluginMember({
        memberAddress: 'invalid',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.false
    })
  })

  describe('isPluginMember', () => {
    it('should return true if member exists', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }
      const pluginMember = { id: 'plugin-member-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(pluginMember)

      const result = await ProxyMember.isPluginMember(params)

      expect(result).to.be.true
    })

    it('should return false if member does not exist', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMember, 'findByPluginAndMember').resolves(null)

      const result = await ProxyMember.isPluginMember(params)

      expect(result).to.be.false
    })

    it('should return false if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.isPluginMember({
        memberAddress: 'invalid',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.false
    })
  })

  describe('hasVotingPower', () => {
    it('should return true if member has voting power', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = { id: 'vp-member-id', votingPower: '1000' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findByTokenAndMember').resolves(vpMember)

      const result = await ProxyMember.hasVotingPower(params)

      expect(result).to.be.true
    })

    it('should return false if member has no voting power', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const vpMember = { id: 'vp-member-id', votingPower: '0' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findByTokenAndMember').resolves(vpMember)

      const result = await ProxyMember.hasVotingPower(params)

      expect(result).to.be.false
    })

    it('should return false if member not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.VpMember, 'findByTokenAndMember').resolves(null)

      const result = await ProxyMember.hasVotingPower(params)

      expect(result).to.be.false
    })
  })

  describe('getOrCreatePluginMetrics', () => {
    it('should return existing PluginMetrics if found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }
      const existingMetrics = { id: 'metrics-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(existingMetrics)

      const result = await ProxyMember.getOrCreatePluginMetrics(params)

      expect(result).to.equal(existingMetrics)
    })

    it('should create new PluginMetrics if not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
        lastActivity: 1680000000,
      }
      const newMetrics = { id: 'new-metrics-id' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.PluginMetrics, 'findExistingLog').resolves(null)
      sandbox.stub(Models.PluginMetrics, 'create').resolves(newMetrics)

      const result = await ProxyMember.getOrCreatePluginMetrics(params)

      expect(result).to.equal(newMetrics)
      expect(
        Models.PluginMetrics.create.calledOnceWith(
          {
            memberAddress: params.memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
            network: params.network,
            voteCount: 0,
            proposalCount: 0,
            firstActivity: params.lastActivity,
            lastActivity: params.lastActivity,
          },
          sinon.match.any,
        ),
      ).to.be.true
    })
  })

  describe('updatePluginMetrics', () => {
    it('should update plugin metrics with counts from database', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumMainnet,
        lastActivity: 1680000000,
      }
      const pluginMetrics = {
        id: 'metrics-id',
        update: sandbox.stub().resolves({ id: 'metrics-id', proposalCount: 3, voteCount: 10 }),
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreatePluginMetrics').resolves(pluginMetrics as any)
      sandbox.stub(Models.Proposal, 'countDocuments').resolves(3)
      sandbox.stub(Models.Vote, 'countDocuments').resolves(10)

      const result = await ProxyMember.updatePluginMetrics(params)

      expect(result?.proposalCount).to.equal(3)
      expect(result?.voteCount).to.equal(10)
      expect(
        Models.Proposal.countDocuments.calledOnceWith(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            creatorAddress: params.memberAddress,
          },
          sinon.match.any,
        ),
      ).to.be.true
      expect(
        Models.Vote.countDocuments.calledOnceWith(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            memberAddress: params.memberAddress,
          },
          sinon.match.any,
        ),
      ).to.be.true
      expect(
        pluginMetrics.update.calledOnceWith(
          { proposalCount: 3, voteCount: 10, lastActivity: 1680000000 },
          sinon.match.any,
        ),
      ).to.be.true
    })

    it('should return null if getOrCreatePluginMetrics fails', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreatePluginMetrics').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updatePluginMetrics(params)

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    it('should handle errors and return null', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreatePluginMetrics').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updatePluginMetrics(params)

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })
})
