import sinon from 'sinon'
import { expect } from 'chai'
import { ENS, NetworksEnum } from '@types'
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
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0x0',
      blockNumber: 0,
      blockTimestamp: 1219577223,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      implementationAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: 'dao.eth',
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
          network: NetworksEnum.ethereumMainnet,
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
    it('should checkIFEns', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').returns(rawMember as any)
      const result = await PairDataModule.checkIFEns('abc.eth')
      expect(result).to.be.eq(rawMember.address)
      expect(findByEnsStub.calledOnce).to.be.true
    })

    it('should return if ens not found', async () => {
      const findByEnsStub = sandbox.stub(Models.Member, 'findByEns').returns(null)
      const result = await PairDataModule.checkIFEns('abc.eth')
      expect(result).to.be.eq('abc.eth')
      expect(findByEnsStub.calledOnce).to.be.true
    })
  })

  describe('pairFromExtraParams', () => {
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
  })
})
