import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import PairDataModule from '@modules/pairData'
import { NetworksEnum } from '@types'

describe('Modules:PairData', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('pairExtraQueryData', () => {
    it('should return daoAddresses when pluginAddress is provided', async () => {
      const plugin = { daoAddress: '0xDaoAddress' }
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)

      const extraParams = { pluginAddress: '0xPluginAddress' }
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.calledWith({ address: extraParams.pluginAddress })).to.be.true
      expect(result).to.deep.equal({ daoAddresses: ['0xDaoAddress'] })
    })

    it('should return empty daoAddresses when plugin is not found', async () => {
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      const extraParams = { pluginAddress: '0xPluginAddress' }
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(findOneStub.calledOnce).to.be.true
      expect(result).to.deep.equal({ daoAddresses: [] })
    })

    it('should return empty extraQueryData when pluginAddress is not provided', async () => {
      const extraParams = {}
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(result).to.deep.equal({})
    })
  })

  describe('pairFromPaginationParams', () => {
    it('should resolve ENS when search contains .eth', async () => {
      const member = { address: '0xMemberAddress' }
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').resolves(member as any)

      const paginationParams = { search: 'example.eth' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)

      expect(findByEnsStub.calledOnceWith('example.eth')).to.be.true
      expect(result.search).to.equal('0xMemberAddress')
    })

    it('should not modify search when ENS is not found', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').resolves(null)

      const paginationParams = { search: 'example.eth' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)

      expect(findByEnsStub.calledOnce).to.be.true
      expect(result.search).to.equal('example.eth')
    })

    it('should not modify search when it does not contain .eth', async () => {
      const paginationParams = { search: '0xAddress' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)

      expect(result.search).to.equal('0xAddress')
    })

    it('should return paginationParams unchanged when search is not provided', async () => {
      const paginationParams = { limit: 10, offset: 0 }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)

      expect(result).to.deep.equal(paginationParams)
    })
  })

  describe('checkIFEns', () => {
    it('should return member address when ENS is found', async () => {
      const member = { address: '0xMemberAddress' }
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').resolves(member as any)

      const result = await PairDataModule.checkIFEns('example.eth')

      expect(findByEnsStub.calledOnceWith('example.eth')).to.be.true
      expect(result).to.equal('0xMemberAddress')
    })

    it('should return original searchStr when ENS is not found', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').resolves(null)

      const result = await PairDataModule.checkIFEns('example.eth')

      expect(findByEnsStub.calledOnce).to.be.true
      expect(result).to.equal('example.eth')
    })

    it('should return original searchStr when it does not contain .eth', async () => {
      const result = await PairDataModule.checkIFEns('0xAddress')

      expect(result).to.equal('0xAddress')
    })
  })

  describe('pairFromExtraParams', () => {
    it('should resolve daoId when provided', async () => {
      const daoDb = { network: NetworksEnum.ethereumMainnet, address: '0xDaoAddress' }
      const findByEntityIdStub = sandbox.stub(Models.Dao, 'findByEntityId').resolves(daoDb as any)

      const extraParams = {} as any
      const pairParams = { daoId: 'dao-id' }
      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(findByEntityIdStub.calledOnceWith('dao-id')).to.be.true
      expect(result.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(result.daoAddress).to.equal('0xDaoAddress')
    })

    it('should include pluginAddresses when onlyActive is true', async () => {
      const daoDb = { network: NetworksEnum.ethereumMainnet, address: '0xDaoAddress' }
      const findByEntityIdStub = sandbox.stub(Models.Dao, 'findByEntityId').resolves(daoDb as any)
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct').resolves(['0xPlugin1', '0xPlugin2'])

      const extraParams = {} as any
      const pairParams = { daoId: 'dao-id', onlyActive: true }
      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.calledOnce).to.be.true
      expect(result.pluginAddresses).to.deep.equal(['0xPlugin1', '0xPlugin2'])
    })

    it('should resolve ens when provided', async () => {
      const memberDb = { address: '0xMemberAddress' }
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').resolves(memberDb as any)

      const extraParams = {} as any
      const pairParams = { ens: 'example.eth' }
      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(findByEnsStub.calledOnceWith('example.eth')).to.be.true
      expect(result.memberAddress).to.equal('0xMemberAddress')
    })

    it('should resolve proposalId when provided', async () => {
      const proposal = { pluginAddress: '0xPluginAddress', proposalIndex: '1' }
      const findByEntityIdStub = sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposal)

      const extraParams = {} as any
      const pairParams = { proposalId: 'proposal-id' }
      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(findByEntityIdStub.calledOnceWith('proposal-id')).to.be.true
      expect(result.pluginAddress).to.equal('0xPluginAddress')
      expect(result.proposalIndex).to.equal('1')
    })

    it('should find plugin by tokenAddress when provided', async () => {
      const plugin = { address: '0xPluginAddress' }
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const extraParams = { tokenAddress: '0xTokenAddress', network: NetworksEnum.ethereumMainnet } as any
      const result = await PairDataModule.pairFromExtraParams(extraParams)

      expect(findByTokenAddressStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result.pluginAddress).to.equal('0xPluginAddress')
    })
  })

  describe('pairAllMemberOfDao', () => {
    it('should return members from PluginMember when pluginAddress is provided', async () => {
      const pluginMembers = [
        {
          memberAddress: '0xMember1',
          daoAddress: '0xDao1',
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
        },
        {
          memberAddress: '0xMember2',
          daoAddress: '0xDao1',
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
        },
      ]
      const plugin = { address: '0xPlugin1', daoAddress: '0xDao1', tokenAddress: null }

      sandbox.stub(Models.PluginMember, 'find').resolves(pluginMembers)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)

      const result = await PairDataModule.pairAllMemberOfDao({
        pluginAddress: '0xPlugin1',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0].memberAddress).to.equal('0xMember1')
      expect(result[1].memberAddress).to.equal('0xMember2')
    })

    it('should include VpMember data when plugin has tokenAddress', async () => {
      const pluginMembers = [
        {
          memberAddress: '0xMember1',
          daoAddress: '0xDao1',
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
        },
      ]
      const vpMembers = [
        {
          memberAddress: '0xMember2',
          tokenAddress: '0xToken1',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '100',
        },
      ]
      const plugin = { address: '0xPlugin1', daoAddress: '0xDao1', tokenAddress: '0xToken1' }

      sandbox.stub(Models.PluginMember, 'find').resolves(pluginMembers)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)
      sandbox.stub(Models.VpMember, 'find').resolves(vpMembers)

      const result = await PairDataModule.pairAllMemberOfDao({
        pluginAddress: '0xPlugin1',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0].memberAddress).to.equal('0xMember1')
      expect(result[1].memberAddress).to.equal('0xMember2')
      expect(result[1].votingPower).to.equal('100')
    })

    it('should query VpMember directly when only tokenAddress is provided', async () => {
      const vpMembers = [
        {
          memberAddress: '0xMember1',
          tokenAddress: '0xToken1',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '100',
        },
        {
          memberAddress: '0xMember2',
          tokenAddress: '0xToken1',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '200',
        },
      ]
      const plugin = { address: '0xPlugin1', daoAddress: '0xDao1' }

      sandbox.stub(Models.VpMember, 'find').resolves(vpMembers)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)

      const result = await PairDataModule.pairAllMemberOfDao({
        tokenAddress: '0xToken1',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0].votingPower).to.equal('100')
      expect(result[1].votingPower).to.equal('200')
    })

    it('should filter by memberAddress when provided', async () => {
      const pluginMembers = [
        {
          memberAddress: '0xMember1',
          daoAddress: '0xDao1',
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
        },
      ]
      const plugin = { address: '0xPlugin1', daoAddress: '0xDao1', tokenAddress: null }

      const findStub = sandbox.stub(Models.PluginMember, 'find').resolves(pluginMembers)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)

      await PairDataModule.pairAllMemberOfDao({
        pluginAddress: '0xPlugin1',
        network: NetworksEnum.ethereumMainnet,
        memberAddress: '0xMember1' as any,
      })

      expect(
        findStub.calledWith({
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
          memberAddress: '0xMember1',
        }),
      ).to.be.true
    })

    it('should remove duplicate members based on memberAddress', async () => {
      const pluginMembers = [
        {
          memberAddress: '0xMember1',
          daoAddress: '0xDao1',
          pluginAddress: '0xPlugin1',
          network: NetworksEnum.ethereumMainnet,
        },
      ]
      const vpMembers = [
        {
          memberAddress: '0xMember1',
          tokenAddress: '0xToken1',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '100',
        },
      ]
      const plugin = { address: '0xPlugin1', daoAddress: '0xDao1', tokenAddress: '0xToken1' }

      sandbox.stub(Models.PluginMember, 'find').resolves(pluginMembers)
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)
      sandbox.stub(Models.VpMember, 'find').resolves(vpMembers)

      const result = await PairDataModule.pairAllMemberOfDao({
        pluginAddress: '0xPlugin1',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].memberAddress).to.equal('0xMember1')
    })
  })
})
