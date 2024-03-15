import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SatsumaHelper from '@helpers/satsuma'
import dayjs from '@helpers/dayjs'
import { DaoList } from '@test/lib/fakeGraphDaos'
import { NetworksEnum } from '@types'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3'
import logger from '@logger'

describe('Helpers: Satsuma', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('_rpCall', async () => {
    it('Should _rpCall', async () => {
      const rpcCallStub = sandbox
        .stub(SatsumaHelper, 'graphRequest')
        .resolves(true)
      const network = NetworksEnum.ethereum
      const query = { test: 1 }
      const params = { test: 2 }

      const response = await SatsumaHelper._rpCall(
        network,
        query as any,
        params,
      )

      expect(response).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.args[0][0]).to.eq(SatsumaHelper.subgraphUrls[network])
      expect(rpcCallStub.args[0][1]).to.eq(query)
      expect(rpcCallStub.args[0][2]).to.eq(params)
    })

    it('handles errors in _rpCall', async () => {
      const testError = new Error('Test error')
      sandbox.stub(SatsumaHelper, 'graphRequest').rejects(testError)

      try {
        await SatsumaHelper._rpCall(NetworksEnum.ethereum, {} as any, {})
        throw new Error('Expected method to reject.')
      } catch (error) {
        expect(error).to.equal(testError)
      }
    })
  })

  describe('getDaosOfMember', async () => {
    it('should getDaosOfMember', async () => {
      const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').resolves({
        tokenVotingMembers: [],
        multisigApprovers: [],
      })
      const network = NetworksEnum.ethereum
      const address = '0xe0bd0fe4e70478d5aaf9df546fc76b964ce0bc54'

      const res = await SatsumaHelper.getDaosOfMember(network, address)

      expect(res).to.deep.equal({
        tokenVotingMembers: [],
        multisigApprovers: [],
      })
      expect(stubRequest.calledOnce).to.be.true
      expect(stubRequest.args[0][0]).to.eq(network)
      expect(stubRequest.args[0][2]).to.deep.equal({
        where: {
          address,
        },
      })
    })

    it('handles error fetching DAO member in getDaosOfMember', async () => {
      const testError = new Error('Test error fetching DAO member')
      sandbox.stub(SatsumaHelper, '_rpCall').rejects(testError)
      const stubLogger = sandbox.stub(logger, 'error')

      const response = await SatsumaHelper.getDaosOfMember(
        NetworksEnum.ethereum,
        '0x...',
      )

      expect(response.tokenVotingMembers).to.deep.equal([])
      expect(response.multisigApprovers).to.deep.equal([])
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error fetching DAO member' as any)).to.be
        .true
    })
  })

  describe('getDaos', async () => {
    it('should getDaos', async () => {
      const limit = 2
      const fakeResponse = {
        daos: [
          {
            id: 'daoId1',
            subdomain: 'subdomain1',
            creator: '0xcreator1',
            daoURI: 'uri1',
            metadata: 'metadata1',
            createdAt: '1619179810',
            proposals: [
              { __typename: 'ProposalType1', id: 'proposal1', executed: true },
              { __typename: 'ProposalType2', id: 'proposal2', executed: false },
            ],
            plugins: [
              {
                plugin: {
                  __typename: 'TokenVotingPlugin',
                  members: [{ votingPower: 100 }],
                },
              },
            ],
          },
          {
            id: 'daoId2',
            subdomain: 'subdomain2',
            creator: '0xcreator2',
            daoURI: 'uri1',
            metadata: 'metadata2',
            createdAt: '1619179812',
            proposals: [
              { __typename: 'ProposalType1', id: 'proposal1', executed: true },
              { __typename: 'ProposalType2', id: 'proposal2', executed: false },
            ],
            plugins: [
              {
                plugin: {
                  __typename: 'MultisigPlugin',
                  members: [{ votingPower: 100 }],
                },
              },
            ],
          },
        ],
      }

      const stubRequest = sandbox
        .stub(SatsumaHelper, '_rpCall')
        .resolves(fakeResponse)
      const network = NetworksEnum.ethereum
      const params = {
        limit,
        skip: 0,
        orderBy: 'createdAt',
        orderDirection: 'asc',
      }

      const res = await SatsumaHelper.getDaos(network, params)

      const expectedNextCursor = Number(
        fakeResponse.daos[fakeResponse.daos.length - 1].createdAt,
      )
      expect(res.nextCursor).to.equal(expectedNextCursor)

      expect(stubRequest.calledOnce).to.be.true
      expect(stubRequest.args[0][0]).to.eq(network)
      expect(stubRequest.args[0][2]).to.deep.equal({
        where: {},
        first: params.limit,
        skip: params.skip,
        orderBy: params.orderBy,
        orderDirection: params.orderDirection,
      })

      // Validate the structure of the returned DAO object matches your expectations
      expect(res.daos[0].creatorAddress).to.eq(
        Web3Utils.parseAddress(fakeResponse.daos[0].creator as any),
      )
      expect(res.daos[0].daoAddress).to.eq(
        Web3Utils.parseAddress(fakeResponse.daos[0].id as any),
      )
      expect(res.daos[0].createdAt).to.deep.equal(
        dayjs.utc(Number(fakeResponse.daos[0].createdAt) * 1000).toDate(),
      )
      expect(res.daos[0].ens).to.eq(fakeResponse.daos[0].daoURI)
      expect(res.daos[0].members).to.eq(
        fakeResponse.daos[0].plugins[0].plugin.members.length,
      )
      expect(res.daos[0].metadataIpfs).to.eq(fakeResponse.daos[0].metadata)
      expect(res.daos[0].network).to.eq(network)
      expect(res.daos[0].pluginName).to.eq(
        fakeResponse.daos[0].plugins[0].plugin.__typename,
      )
      expect(res.daos[0].proposalsCreated).to.eq(
        fakeResponse.daos[0].proposals.length,
      )
      expect(res.daos[0].proposalsExecuted).to.eq(
        fakeResponse.daos[0].proposals.filter(p => p.executed).length,
      )
      expect(res.daos[0].tvlUSD).to.eq(0)
      expect(res.daos[0].uniqueVoters).to.eq(0)
      expect(res.daos[0].votes).to.eq(0)
      expect(res.daos[0].hideDao).to.eq(false)

      expect(res.daos.length).to.equal(2)
      expect(res.daos[0].block).to.equal(1619179810)
      expect(res.daos[1].block).to.equal(1619179812)
    })

    it('logs error and returns default response on failure', async () => {
      const testError = new Error('Test fetch DAOs error')
      const stubRequest = sandbox
        .stub(SatsumaHelper, '_rpCall')
        .rejects(testError)
      const stubLogger = sandbox.stub(logger, 'error')

      const network = NetworksEnum.ethereum
      const params = {
        limit: 10,
        skip: 0,
        orderBy: 'createdAt',
        orderDirection: 'asc',
      }

      const response = await SatsumaHelper.getDaos(network, params)

      expect(stubLogger.calledOnceWith('Error fetching DAOs' as any)).to.be.true

      expect(response).to.deep.equal({
        daos: [],
        limit: params.limit,
        skip: params.skip,
        results: 0,
        skipResult: 0,
        excludedResult: 0,
        nextCursor: 0,
      })

      expect(stubRequest.calledOnce).to.be.true
    })
  })

  describe('_parseDao', () => {
    it('should _parseDao', () => {
      const rawDao = DaoList[0]
      const network = NetworksEnum.ethereum

      const processedDao = SatsumaHelper._parseDao(rawDao as any, network) // This assumes _parseDao is accessible

      const expectedDao = {
        creatorAddress: Web3Utils.parseAddress(rawDao?.creator as any),
        daoAddress: Web3Utils.parseAddress(rawDao.id as any),
        block: Number(rawDao.createdAt),
        createdAt: dayjs.utc(Number(rawDao.createdAt) * 1000).toDate(),
        ens: rawDao.daoURI,
        members: rawDao.plugins[0].plugin.members.length,
        metadataIpfs: rawDao.metadata,
        network: network,
        pluginName: rawDao.plugins[0].plugin.__typename,
        proposalsCreated: rawDao.proposals?.length,
        proposalsExecuted: rawDao.proposals?.filter(p => p.executed).length,
        tvlUSD: 0,
        txHash: utils.zeroAddress,
        uniqueVoters: 0,
        votes: 0,
        hideDao: false,
      }

      expect(processedDao).to.deep.equal(expectedDao)
    })

    it('returns undefined for _parseDao when no plugin info is found', () => {
      const dao = {
        id: 'daoId',
        creator: 'creatorAddress',
        createdAt: '123',
        daoURI: 'daoUri',
        metadata: 'metadata',
        plugins: [
          {
            plugin: null,
          },
        ],
      }

      const result = SatsumaHelper._parseDao(dao as any, NetworksEnum.ethereum)
      expect(result).to.be.undefined
    })

    it('handles non-existent pluginType in _parseDao', () => {
      const rawDao = {
        id: 'someId',
        creator: '0xcreator',
        createdAt: '1619179810',
        daoURI: 'someUri',
        metadata: 'someMetadata',
        proposals: [],
        plugins: [{ plugin: { __typename: 'UnrecognizedPluginType' } }],
      }

      const parsedDao = SatsumaHelper._parseDao(
        rawDao as any,
        NetworksEnum.ethereum,
      )
      expect(parsedDao).to.be.undefined
    })
  })

  describe('_getPluginInfo', () => {
    it('should _getPluginInfo', () => {
      const rawDao = DaoList[0]

      const pluginInfo = SatsumaHelper._getPluginInfo(rawDao as any)

      const expectedResult = {
        pluginType: 'MultisigPlugin',
        membersCount: 1,
      }

      expect(pluginInfo).to.deep.equal(expectedResult)
    })

    it('returns undefined for _getPluginInfo when pluginType is not found', () => {
      const dao = {
        plugins: [
          {
            plugin: null,
          },
        ],
      }

      const result = SatsumaHelper._getPluginInfo(dao as any)
      expect(result).to.be.undefined
    })

    it('returns undefined for _getPluginInfo when pluginType is unrecognized', () => {
      const dao = {
        plugins: [
          {
            plugin: {
              __typename: 'UnrecognizedPlugin',
            },
          },
        ],
      }

      const result = SatsumaHelper._getPluginInfo(dao as any)
      expect(result).to.be.undefined
    })
  })
})
