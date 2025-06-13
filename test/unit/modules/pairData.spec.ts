import sinon from 'sinon'
import { expect } from 'chai'
import { ENS, NetworksEnum, IPluginStatus } from '@types'
import PairDataModule from '@modules/pairData'
import Member from '@models/schema/member'
import { Models } from '@dbModels'
import Dao from '@models/schema/dao'

describe('Modules:PairDataModule', () => {
  let sandbox: sinon.SinonSandbox
  let rawMember: Partial<Member>
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDao = {
      network: NetworksEnum.ethereumSepolia,
      transactionHash: '0x0',
      blockNumber: 0,
      blockTimestamp: 1219577223,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: 'test.dao.eth',
      subdomain: 'dao',
      members: 10,
      metadataIpfs: 'metadataIpfs',
      name: 'fake-name',
      description: 'fake-description',
      avatar: 'fake-avatar',
      links: [
        {
          name: 'fake-name',
          url: 'fake-url',
        },
      ],
      metrics: {
        tvlUSD: 10000,
        members: 15,
        proposalsCreated: 5,
        proposalsExecuted: 3,
        uniqueVoters: 100,
        votes: 500,
      },
      tvlUSD: 10000,
      plugins: [
        {
          transactionHash: '0x0',
          blockNumber: 0,
          address: '0x0',
          implementationAddress: '0x0',
          tokenAddress: '0x01',
          pluginSetupRepoAddress: '0x02',
          release: '0',
          build: '0',
          subdomain: 'test',
        },
      ],
      isHidden: false,
    }

    rawMember = {
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: 'test.eth',
      history: [
        {
          network: NetworksEnum.ethereumSepolia,
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
          pluginSubdomain: 'token-voting',
          tokenBalance: '100',
          metrics: {
            delegateReceivedCount: 0,
            voteCount: 0,
            proposalCount: 0,
          },
          fromBlockTimestamp: 0,
        },
      ],
    }

    await Models.Member.create(rawMember as any)
    await Models.Dao.create(rawDao as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('pairExtraQueryData', () => {
    it('should return daoAddresses when pluginAddress is provided and plugin exists', async () => {
      const plugin = { daoAddress: '0xDaoAddress123' }
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)

      const extraParams = { pluginAddress: '0xPluginAddress123' as any }
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.calledWith({ address: extraParams.pluginAddress })).to.be.true
      expect(result.daoAddresses).to.deep.equal(['0xDaoAddress123'])
    })

    it('should return empty array when plugin is not found', async () => {
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      const extraParams = { pluginAddress: '0xNonExistentPlugin' as any }
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(findOneStub.calledOnce).to.be.true
      expect(result.daoAddresses).to.deep.equal([])
    })

    it('should return empty array when plugin has no daoAddress', async () => {
      const plugin = { daoAddress: null }
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(plugin as any)

      const extraParams = { pluginAddress: '0xPluginWithoutDao' as any }
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(result.daoAddresses).to.deep.equal([])
    })

    it('should return empty object when no pluginAddress provided', async () => {
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne')

      const extraParams = {}
      const result = await PairDataModule.pairExtraQueryData(extraParams)

      expect(findOneStub.called).to.be.false
      expect(result).to.deep.equal({})
    })
  })

  describe('pairFromPaginationParams', () => {
    it('should pairFromPaginationParams with ens', async () => {
      const paginationParams = { search: rawMember.ens }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams as any)
      expect(result.search).to.be.equal(rawMember.address)
    })

    it('should pairFromPaginationParams with ens - not a member', async () => {
      const paginationParams = { search: 'test1.eth' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)
      expect(result.search).to.be.equal(paginationParams.search)
    })

    it('should pairFromPaginationParams with no ens', async () => {
      const paginationParams = { search: 'test1' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)
      expect(result.search).to.be.equal(paginationParams.search)
    })

    it('should handle empty search string', async () => {
      const paginationParams = { search: '' }
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)
      expect(result.search).to.be.equal('')
    })

    it('should handle undefined search', async () => {
      const paginationParams = {}
      const result = await PairDataModule.pairFromPaginationParams(paginationParams)
      expect(result.search).to.be.undefined
    })

    it('should handle null paginationParams', async () => {
      const result = await PairDataModule.pairFromPaginationParams(null as any)
      expect(result).to.be.null
    })
  })

  describe('checkIFEns', () => {
    it('should return address when ENS is found', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').returns(rawMember as any)
      const result = await PairDataModule.checkIFEns('abc.eth')
      expect(result).to.be.eq(rawMember.address)
      expect(findByEnsStub.calledOnce).to.be.true
    })

    it('should return original string if ens not found', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').returns(null)
      const result = await PairDataModule.checkIFEns('abc.eth')
      expect(result).to.be.eq('abc.eth')
      expect(findByEnsStub.calledOnce).to.be.true
    })

    it('should return original string if not an ENS', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns')
      const result = await PairDataModule.checkIFEns('0x1234567890')
      expect(result).to.be.eq('0x1234567890')
      expect(findByEnsStub.called).to.be.false
    })
  })

  describe('pairFromExtraParams', () => {
    it('should pairFromExtraParams with daoId', async () => {
      const extraParams = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
        ens: rawMember.ens as ENS,
      }

      const result: any = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(result.network).to.be.equal(rawDao.network)
      expect(result.daoAddress).to.be.equal(rawDao.address)
      expect(result.memberAddress).to.be.equal(rawMember.address)
    })

    it('should pairFromExtraParams - no dao, ens', async () => {
      const extraParams = {}
      const pairParams = { daoId: 'fake-id', ens: 'fake-ens.eth' }

      const result: any = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(result.network).to.be.undefined
      expect(result.daoAddress).to.be.undefined
      expect(result.memberAddress).to.be.undefined
    })

    it('should pair from proposal id - found', async () => {
      const findProposalStub = sandbox
        .stub(Models.Proposal, 'findByEntityId')
        .returns({ pluginAddress: rawDao.plugins![0].address, proposalIndex: 1 } as any)
      const extraParams: any = {}

      await PairDataModule.pairFromExtraParams(extraParams, { proposalId: 'fake-id' })
      expect(findProposalStub.calledOnce).to.be.true
      expect(extraParams.pluginAddress).to.be.eq(rawDao.plugins![0].address)
      expect(extraParams.proposalIndex).to.be.eq(1)
    })

    it('should not pair from proposal id when not found', async () => {
      const findProposalStub = sandbox.stub(Models.Proposal, 'findByEntityId').returns(null)
      const extraParams: any = {}

      await PairDataModule.pairFromExtraParams(extraParams, { proposalId: 'fake-id' })
      expect(findProposalStub.calledOnce).to.be.true
      expect(extraParams.pluginAddress).to.be.undefined
      expect(extraParams.proposalIndex).to.be.undefined
    })

    it('should resolve pluginAddress from tokenAddress', async () => {
      const plugin = { address: '0xPluginAddress' }
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin as any)

      const extraParams: any = {
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumSepolia,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams)

      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(findByTokenAddressStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result.pluginAddress).to.equal('0xPluginAddress')
    })

    it('should not set pluginAddress when token plugin not found', async () => {
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      const extraParams: any = {
        tokenAddress: '0xTokenAddress',
        network: NetworksEnum.ethereumSepolia,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams)

      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(result.pluginAddress).to.be.undefined
    })

    it('should handle undefined pairParams', async () => {
      const extraParams = { network: NetworksEnum.ethereumSepolia }
      const result = await PairDataModule.pairFromExtraParams(extraParams)

      expect(result).to.deep.equal(extraParams)
    })
  })

  describe('pairFromExtraParams with onlyActive', () => {
    it('should populate pluginAddresses when daoId is provided and onlyActive is true', async () => {
      const activePluginAddresses = ['0xPlugin1', '0xPlugin2', '0xPlugin3']
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct').resolves(activePluginAddresses)

      const extraParams: any = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
        onlyActive: true,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.calledOnce).to.be.true
      expect(
        distinctStub.calledWith('address', {
          daoAddress: rawDao.address,
          network: rawDao.network,
          status: IPluginStatus.installed,
        }),
      ).to.be.true
      expect(result.pluginAddresses).to.deep.equal(activePluginAddresses)
      expect(result.network).to.equal(rawDao.network)
      expect(result.daoAddress).to.equal(rawDao.address)
    })

    it('should set empty array when onlyActive is true but no active plugins found', async () => {
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct').resolves([])

      const extraParams: any = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
        onlyActive: true,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.calledOnce).to.be.true
      expect(result.pluginAddresses).to.deep.equal([])
      expect(result.network).to.equal(rawDao.network)
      expect(result.daoAddress).to.equal(rawDao.address)
    })

    it('should not populate pluginAddresses when onlyActive is false', async () => {
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct')

      const extraParams: any = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
        onlyActive: false,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.called).to.be.false
      expect(result.pluginAddresses).to.be.undefined
      expect(result.network).to.equal(rawDao.network)
      expect(result.daoAddress).to.equal(rawDao.address)
    })

    it('should not populate pluginAddresses when onlyActive is not provided', async () => {
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct')

      const extraParams: any = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.called).to.be.false
      expect(result.pluginAddresses).to.be.undefined
      expect(result.network).to.equal(rawDao.network)
      expect(result.daoAddress).to.equal(rawDao.address)
    })

    it('should not call distinct when daoId is not found', async () => {
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct')

      const extraParams: any = {}
      const pairParams = {
        daoId: 'non-existent-dao-id',
        onlyActive: true,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.called).to.be.false
      expect(result.pluginAddresses).to.be.undefined
      expect(result.network).to.be.undefined
      expect(result.daoAddress).to.be.undefined
    })

    it('should handle onlyActive along with other pairParams', async () => {
      const activePluginAddresses = ['0xActivePlugin1', '0xActivePlugin2']
      const distinctStub = sandbox.stub(Models.Plugin, 'distinct').resolves(activePluginAddresses)

      const extraParams: any = {}
      const pairParams = {
        daoId: Models.Dao.getEntityId({ network: rawDao.network, address: rawDao.address } as any),
        ens: rawMember.ens as ENS,
        onlyActive: true,
      }

      const result = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

      expect(distinctStub.calledOnce).to.be.true
      expect(
        distinctStub.calledWith('address', {
          daoAddress: rawDao.address,
          network: rawDao.network,
          status: IPluginStatus.installed,
        }),
      ).to.be.true
      expect(result.pluginAddresses).to.deep.equal(activePluginAddresses)
      expect(result.network).to.equal(rawDao.network)
      expect(result.daoAddress).to.equal(rawDao.address)
      expect(result.memberAddress).to.equal(rawMember.address)
    })
  })
})
