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
import DbTx from '@modules/dbTx'

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
    it('should return existing TokenMember if found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const existingTokenMember = { id: 'vp-member-id', votingPower: '100' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(existingTokenMember)

      const result = await ProxyMember.getOrCreateVotingPower(params)

      expect(result).to.equal(existingTokenMember)
    })

    it('should create new TokenMember if not found', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const newTokenMember = { id: 'new-vp-member-id', votingPower: '0' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.TokenMember, 'findExistingLog').resolves(null)
      sandbox.stub(Models.TokenMember, 'create').resolves(newTokenMember)

      const result = await ProxyMember.getOrCreateVotingPower(params)

      expect(result).to.equal(newTokenMember)
      expect(
        Models.TokenMember.create.calledOnceWith(
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
      sandbox.stub(Models.TokenMember, 'findExistingLog').rejects(new Error('Database error'))
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
    it('should update voting power when lastVPBlockNumber is greater', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 20,
      }
      const tokenMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000' }),
        lastVPBlockNumber: 10,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(tokenMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.votingPower).to.equal('1000')
      expect(tokenMember.update.calledOnceWith({ votingPower: '1000', lastVPBlockNumber: 20 }, sinon.match.any)).to.be.true
    })

    it('should update voting power when current lastVPBlockNumber is null', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 15,
      }
      const tokenMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000' }),
        lastVPBlockNumber: null,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(tokenMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.votingPower).to.equal('1000')
      expect(tokenMember.update.calledOnceWith({ votingPower: '1000', lastVPBlockNumber: 15 }, sinon.match.any)).to.be.true
    })

    it('should not update voting power when lastVPBlockNumber is lower', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 5,
      }
      const tokenMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000' }),
        lastVPBlockNumber: 10,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(tokenMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result).to.equal(tokenMember)
      expect(tokenMember.update.called).to.be.false
    })

    it('should update tokenIds when provided', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        tokenIds: ['1', '2', '3'],
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 20,
      }
      const tokenMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '1000', tokenIds: ['1', '2', '3'] }),
        lastVPBlockNumber: 10,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(tokenMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.tokenIds).to.deep.equal(['1', '2', '3'])
      expect(
        tokenMember.update.calledOnceWith(
          { votingPower: '1000', tokenIds: ['1', '2', '3'], lastVPBlockNumber: 20 },
          sinon.match.any,
        ),
      ).to.be.true
    })

    it('should clear tokenIds when voting power is 0', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '0',
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 20,
      }
      const tokenMember = {
        id: 'vp-member-id',
        votingPower: '100',
        update: sandbox.stub().resolves({ id: 'vp-member-id', votingPower: '0', tokenIds: [] }),
        lastVPBlockNumber: 10,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(tokenMember as any)

      const result = await ProxyMember.updateVotingPower(params)

      expect(result?.votingPower).to.equal('0')
      expect(tokenMember.update.calledOnceWith({ votingPower: '0', tokenIds: [], lastVPBlockNumber: 20 }, sinon.match.any))
        .to.be.true
    })

    it('should return null if getOrCreateVotingPower fails', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        votingPower: '1000',
        network: NetworksEnum.ethereumMainnet,
        lastVPBlockNumber: 0,
      }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(ProxyMember, 'getOrCreateVotingPower').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateVotingPower(params)

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
      const tokenMember = { id: 'vp-member-id', votingPower: '1000' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.TokenMember, 'findByTokenAndMember').resolves(tokenMember)

      const result = await ProxyMember.hasVotingPower(params)

      expect(result).to.be.true
    })

    it('should return false if member has no voting power', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenMember = { id: 'vp-member-id', votingPower: '0' }

      sandbox.stub(Web3Utils, 'parseAddress').returns(params.memberAddress)
      sandbox.stub(Models.TokenMember, 'findByTokenAndMember').resolves(tokenMember)

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
      sandbox.stub(Models.TokenMember, 'findByTokenAndMember').resolves(null)

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

  describe('Batch Methods', () => {
    describe('createMembersBatch', () => {
      it('should create/update multiple members in batch', async () => {
        const members = [
          { memberAddress: '0xmember1', lastActivity: 100 },
          { memberAddress: '0xmember2', lastActivity: 200 },
          { memberAddress: '0xmember3', lastActivity: 300 },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        const result = await ProxyMember.createMembersBatch(members)

        expect(result).to.be.true
        expect(bulkWriteStub.calledOnce).to.be.true

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps).to.have.lengthOf(3)

        // Verify first member operation
        expect(bulkOps[0].updateOne.filter).to.deep.equal({ id: '0xmember1' })
        expect(bulkOps[0].updateOne.update.$set).to.include({
          address: '0xmember1',
          lastActivity: 100,
        })
        expect(bulkOps[0].updateOne.update.$setOnInsert).to.include({
          id: '0xmember1',
          firstActivity: 100,
          ens: null,
        })
        expect(bulkOps[0].updateOne.upsert).to.be.true
      })

      it('should skip invalid addresses', async () => {
        const members = [
          { memberAddress: '0xmember1', lastActivity: 100 },
          { memberAddress: 'invalid', lastActivity: 200 },
          { memberAddress: '0xmember3', lastActivity: 300 },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => {
          return address === 'invalid' ? null : address
        })

        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        await ProxyMember.createMembersBatch(members)

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps).to.have.lengthOf(2) // Only 2 valid addresses
      })

      it('should handle errors gracefully', async () => {
        const members = [{ memberAddress: '0xmember1', lastActivity: 100 }]
        const error = new Error('Database error')

        // Stub DbTx.executeTxFn to throw error
        sandbox.stub(DbTx, 'executeTxFn').rejects(error)
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.createMembersBatch(members)

        expect(result).to.be.false
        expect(loggerErrorStub.calledOnce).to.be.true
      })
    })

    describe('updateVotingPowerBatch', () => {
      it('should update voting powers keeping only latest per member', async () => {
        const updates = [
          {
            memberAddress: '0xmember1',
            tokenAddress: '0xtoken1',
            votingPower: '100',
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 1000,
          },
          {
            memberAddress: '0xmember1',
            tokenAddress: '0xtoken1',
            votingPower: '200',
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 2000, // Higher block number
          },
          {
            memberAddress: '0xmember2',
            tokenAddress: '0xtoken1',
            votingPower: '300',
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 1500,
          },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
        sandbox.stub(Models.TokenMember, 'getEntityId').callsFake((params: any) => {
          return `${params.network}-${params.tokenAddress}-${params.memberAddress}`
        })

        const bulkWriteStub = sandbox.stub(Models.TokenMember, 'bulkWrite').resolves()

        const result = await ProxyMember.updateVotingPowerBatch(updates)

        expect(result).to.be.true
        expect(bulkWriteStub.calledOnce).to.be.true

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps).to.have.lengthOf(2) // Only 2 unique members

        // Verify member1 uses the update with higher block number
        const member1Op = bulkOps.find((op: any) => op.updateOne.filter.id.includes('0xmember1'))
        expect(member1Op.updateOne.update.$set.votingPower).to.equal('200')
        expect(member1Op.updateOne.update.$set.lastVPBlockNumber).to.equal(2000)

        // Verify filter condition to only update if block number is higher
        expect(member1Op.updateOne.filter.$or).to.deep.equal([
          { lastVPBlockNumber: { $exists: false } },
          { lastVPBlockNumber: { $lt: 2000 } },
        ])
      })

      it('should set tokenIds to empty array when voting power is 0', async () => {
        const updates = [
          {
            memberAddress: '0xmember1',
            tokenAddress: '0xtoken1',
            votingPower: '0',
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 1000,
          },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').returns('0xmember1')
        sandbox.stub(Models.TokenMember, 'getEntityId').returns('test-id')
        const bulkWriteStub = sandbox.stub(Models.TokenMember, 'bulkWrite').resolves()

        await ProxyMember.updateVotingPowerBatch(updates)

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps[0].updateOne.update.$set.tokenIds).to.deep.equal([])
      })

      it('should handle tokenIds when provided', async () => {
        const updates = [
          {
            memberAddress: '0xmember1',
            tokenAddress: '0xtoken1',
            votingPower: '100',
            tokenIds: ['1', '2', '3'],
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 1000,
          },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').returns('0xmember1')
        sandbox.stub(Models.TokenMember, 'getEntityId').returns('test-id')
        const bulkWriteStub = sandbox.stub(Models.TokenMember, 'bulkWrite').resolves()

        await ProxyMember.updateVotingPowerBatch(updates)

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps[0].updateOne.update.$set.tokenIds).to.deep.equal(['1', '2', '3'])
      })

      it('should handle bulk write errors', async () => {
        const updates = [
          {
            memberAddress: '0xmember1',
            tokenAddress: '0xtoken1',
            votingPower: '100',
            network: NetworksEnum.ethereumMainnet,
            lastVPBlockNumber: 1000,
          },
        ]

        const error = new Error('Bulk write error')
        // Stub DbTx.executeTxFn to throw error
        sandbox.stub(DbTx, 'executeTxFn').rejects(error)
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.updateVotingPowerBatch(updates)

        expect(result).to.be.false
        expect(loggerErrorStub.calledOnce).to.be.true
      })
    })

    describe('updatePluginMetricsBatch', () => {
      it('should update plugin metrics in batch', async () => {
        const updates = [
          {
            memberAddress: '0xmember1',
            pluginAddress: '0xplugin1',
            daoAddress: '0xdao1',
            network: NetworksEnum.ethereumMainnet,
            lastActivity: 1000,
          },
          {
            memberAddress: '0xmember2',
            pluginAddress: '0xplugin1',
            daoAddress: '0xdao1',
            network: NetworksEnum.ethereumMainnet,
            lastActivity: 2000,
          },
        ]

        sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
        sandbox.stub(Models.PluginMetrics, 'getEntityId').callsFake((params: any) => {
          return `${params.network}-${params.memberAddress}-${params.pluginAddress}`
        })

        const bulkWriteStub = sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

        const result = await ProxyMember.updatePluginMetricsBatch(updates)

        expect(result).to.be.true
        expect(bulkWriteStub.calledOnce).to.be.true

        const bulkOps = bulkWriteStub.getCall(0).args[0]
        expect(bulkOps).to.have.lengthOf(2)

        // Verify first update
        expect(bulkOps[0].updateOne.update.$set).to.include({
          daoAddress: '0xdao1',
          lastActivity: 1000,
        })
        expect(bulkOps[0].updateOne.update.$setOnInsert).to.include({
          voteCount: 0,
          proposalCount: 0,
          firstActivity: 1000,
        })
        expect(bulkOps[0].updateOne.upsert).to.be.true
      })
    })

    describe('NoTx Batch Methods', () => {
      describe('createMembersBatchNoTx', () => {
        it('should create/update multiple members without transaction', async () => {
          const members = [
            { memberAddress: '0xmember1', lastActivity: 100 },
            { memberAddress: '0xmember2', lastActivity: 200 },
          ]

          sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
          const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

          const result = await ProxyMember.createMembersBatchNoTx(members)

          expect(result).to.be.true
          expect(bulkWriteStub.calledOnce).to.be.true

          const bulkOps = bulkWriteStub.getCall(0).args[0]
          expect(bulkOps).to.have.lengthOf(2)

          // Should have ordered: false for parallel processing
          const options = bulkWriteStub.getCall(0).args[1]
          expect(options.ordered).to.be.false
          expect(options.session).to.be.undefined
        })
      })

      describe('updateVotingPowerBatchNoTx', () => {
        it('should update voting powers without transaction and handle duplicate key errors', async () => {
          const updates = [
            {
              memberAddress: '0xmember1',
              tokenAddress: '0xtoken1',
              votingPower: '1000',
              network: NetworksEnum.ethereumMainnet,
              lastVPBlockNumber: 100,
            },
          ]

          sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
          sandbox.stub(Models.TokenMember, 'getEntityId').returns('test-id')

          const bulkError = new Error('Bulk write error') as any
          bulkError.code = 11000
          bulkError.writeErrors = [{ code: 11000 }] // Only duplicate key errors

          const bulkWriteStub = sandbox.stub(Models.TokenMember, 'bulkWrite').rejects(bulkError)

          const result = await ProxyMember.updateVotingPowerBatchNoTx(updates)

          // Should succeed even with duplicate key errors
          expect(result).to.be.true
          expect(bulkWriteStub.calledOnce).to.be.true

          const options = bulkWriteStub.getCall(0).args[1]
          expect(options.ordered).to.be.false
          expect(options.session).to.be.undefined
        })

        it('should fail on non-duplicate errors', async () => {
          const updates = [
            {
              memberAddress: '0xmember1',
              tokenAddress: '0xtoken1',
              votingPower: '1000',
              network: NetworksEnum.ethereumMainnet,
              lastVPBlockNumber: 100,
            },
          ]

          sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
          sandbox.stub(Models.TokenMember, 'getEntityId').returns('test-id')

          const bulkError = new Error('Bulk write error') as any
          bulkError.code = 11000
          bulkError.writeErrors = [{ code: 500 }] // Non-duplicate error

          sandbox.stub(Models.TokenMember, 'bulkWrite').rejects(bulkError)

          const result = await ProxyMember.updateVotingPowerBatchNoTx(updates)

          expect(result).to.be.false
        })
      })

      describe('updatePluginMetricsBatchNoTx', () => {
        it('should update plugin metrics without transaction', async () => {
          const updates = [
            {
              memberAddress: '0xmember1',
              pluginAddress: '0xplugin1',
              daoAddress: '0xdao1',
              network: NetworksEnum.ethereumMainnet,
              lastActivity: 1000,
            },
          ]

          sandbox.stub(Web3Utils, 'parseAddress').callsFake((address: string) => address)
          sandbox.stub(Models.PluginMetrics, 'getEntityId').returns('test-id')
          const bulkWriteStub = sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

          const result = await ProxyMember.updatePluginMetricsBatchNoTx(updates)

          expect(result).to.be.true
          expect(bulkWriteStub.calledOnce).to.be.true

          const options = bulkWriteStub.getCall(0).args[1]
          expect(options.ordered).to.be.false
          expect(options.session).to.be.undefined
        })
      })
    })
  })
})
