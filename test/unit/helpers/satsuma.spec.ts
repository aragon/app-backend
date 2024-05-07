import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SatsumaHelper from '@helpers/satsuma'
import dayjs from '@helpers/dayjs'
import { DaoList } from '@test/mock/fakeGraphDaos'
import { HexAddress, NetworksEnum } from '@types'
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
      const rpcCallStub = sandbox.stub(SatsumaHelper, 'graphRequest').resolves(true)
      const network = NetworksEnum.mainnet
      const query = { test: 1 }
      const params = { test: 2 }

      const response = await SatsumaHelper._rpCall(network, query as any, params)

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
        await SatsumaHelper._rpCall(NetworksEnum.mainnet, {} as any, {})
      } catch (error) {
        expect(error).to.equal(testError)
      }
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
                  pluginAddress: '0xa96b5f30132bb56bd6faee2fdf4a4e14ad413206',
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
                  pluginAddress: '0xa96b5f30132bb56bd6faee2fdf4a4e14ad413206',
                  __typename: 'MultisigPlugin',
                  members: [{ votingPower: 100 }],
                },
              },
            ],
          },
        ],
      }

      const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').resolves(fakeResponse)
      const network = NetworksEnum.mainnet
      const params = {
        limit,
        skip: 0,
        orderProp: 'createdAt',
        order: 'asc',
      }

      const res = await SatsumaHelper.getDaos(network, params)

      const expectedNextCursor = Number(fakeResponse.daos[fakeResponse.daos.length - 1].createdAt)
      expect(res.nextCursor).to.equal(expectedNextCursor)

      expect(stubRequest.calledOnce).to.be.true
      expect(stubRequest.args[0][0]).to.eq(network)
      expect(stubRequest.args[0][2]).to.deep.equal({
        where: {},
        first: params.limit,
        skip: params.skip,
        orderBy: params.orderProp,
        orderDirection: params.order,
      })

      // Validate the structure of the returned DAO object matches your expectations
      expect(res.daos[0].creatorAddress).to.eq(Web3Utils.parseAddress(fakeResponse.daos[0].creator as any))
      expect(res.daos[0].daoAddress).to.eq(Web3Utils.parseAddress(fakeResponse.daos[0].id as any))
      expect(res.daos[0].createdAt).to.deep.equal(dayjs.utc(Number(fakeResponse.daos[0].createdAt) * 1000).toDate())
      expect(res.daos[0].ens).to.eq(fakeResponse.daos[0].daoURI)
      expect(res.daos[0].members).to.eq(fakeResponse.daos[0].plugins[0].plugin.members.length)
      expect(res.daos[0].metadataIpfs).to.eq(fakeResponse.daos[0].metadata)
      expect(res.daos[0].network).to.eq(network)
      // expect(res.daos[0].pluginName).to.eq(
      //   fakeResponse.daos[0].plugins[0].plugin.__typename,
      // )
      expect(res.daos[0].proposalsCreated).to.eq(fakeResponse.daos[0].proposals.length)
      expect(res.daos[0].proposalsExecuted).to.eq(fakeResponse.daos[0].proposals.filter(p => p.executed).length)
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
      const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').rejects(testError)
      const stubLogger = sandbox.stub(logger, 'error')

      const network = NetworksEnum.mainnet
      const params = {
        limit: 10,
        skip: 0,
        orderProp: 'createdAt',
        order: 'asc',
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
      const network = NetworksEnum.mainnet

      const processedDao = SatsumaHelper._parseDao(rawDao as any, network) // This assumes _parseDao is accessible

      const expectedDao = {
        avatar: null,
        description: null,
        name: null,
        permalink: null,
        creatorAddress: Web3Utils.parseAddress(rawDao?.creator as any),
        daoAddress: Web3Utils.parseAddress(rawDao.id as any),
        block: Number(rawDao.createdAt),
        blockTime: dayjs.utc(Number(rawDao.createdAt) * 1000).toDate(),
        createdAt: dayjs.utc(Number(rawDao.createdAt) * 1000).toDate(),
        ens: rawDao.daoURI,
        members: rawDao.plugins[0].plugin.members.length,
        metadataIpfs: rawDao.metadata,
        network,
        links: [],
        plugins: [
          {
            address: rawDao.plugins[0].plugin.pluginAddress,
            type: rawDao.plugins[0].plugin.__typename,
          },
        ],
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

      const result = SatsumaHelper._parseDao(dao as any, NetworksEnum.mainnet)
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

      const parsedDao = SatsumaHelper._parseDao(rawDao as any, NetworksEnum.mainnet)
      expect(parsedDao).to.be.undefined
    })
  })

  describe('_getPluginInfo', () => {
    it('should _getPluginInfo', () => {
      const rawDao = DaoList[0]

      const pluginInfo = SatsumaHelper._parsePlugins(rawDao as any)

      const expectedResult = {
        address: '0xa96b5f30132bb56bd6faee2fdf4a4e14ad413206',
        type: 'MultisigPlugin',
        membersCount: 1,
      }

      expect(pluginInfo.length).to.eq(1)
      expect(pluginInfo[0]).to.deep.equal(expectedResult)
    })

    it('returns undefined for _getPluginInfo when pluginType is not found', () => {
      const dao = {
        plugins: [
          {
            plugin: null,
          },
        ],
      }

      const result = SatsumaHelper._parsePlugins(dao as any)
      expect(result.length).to.eq(0)
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

      const result = SatsumaHelper._parsePlugins(dao as any)
      expect(result.length).to.eq(0)
    })

    it('returns Invalid plugins structure', () => {
      const dao = {}

      const stubLogger = sandbox.stub(logger, 'warn')
      const result = SatsumaHelper._parsePlugins(dao as any)
      expect(result.length).to.eq(0)
      expect(stubLogger.calledOnceWith('Invalid DAO plugins structure' as any)).to.be.true
    })
  })

  describe('getTokenVotingMembers', async () => {
    it('should getTokenVotingMembers', async () => {
      const mockDao = DaoList[3]

      const fakeResponse = [
        {
          address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
          balance: '69000000000000000000',
          votingPower: '69000000000000000000',
          delegatee: {
            address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
          },
          delegators: [
            {
              address: '0x826976d7c600d45fb8287ca1d7c76fc8eb732030',
              balance: '69000000000000000000',
            },
          ],
        },
        {
          address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
          balance: '69000000000000000000',
          votingPower: '69000000000000000000',
          delegatee: {
            address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
          },
          delegators: [
            {
              address: '0x839395e20bbb182fa440d08f850e6c7a8f6f0780',
              balance: '69000000000000000000',
            },
          ],
        },
      ]
      const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').resolves({ tokenVotingMembers: fakeResponse })
      const network = NetworksEnum.mainnet
      const pluginAddress = mockDao.plugins[0].plugin.pluginAddress as HexAddress
      const filters = {
        limit: 10,
        skip: 0,
        orderProp: 'address',
        order: 'asc',
      }

      const res = await SatsumaHelper.getTokenVotingMembers(network, pluginAddress, filters)

      expect(res).to.deep.equal(fakeResponse)
      expect(stubRequest.calledOnce).to.be.true
      expect(stubRequest.args[0][0]).to.eq(network)
      expect(stubRequest.args[0][2]).to.deep.equal({
        where: { plugin: pluginAddress.toLowerCase() },
        limit: filters.limit,
        skip: filters.skip,
        sortBy: filters.orderProp,
        direction: filters.order,
      })
    })

    it('handles error getTokenVotingMembers', async () => {
      const mockDao = DaoList[3]
      const pluginAddress = mockDao.plugins[0].plugin.pluginAddress as HexAddress
      const network = NetworksEnum.mainnet
      const filters = {
        limit: 10,
        skip: 0,
        orderProp: 'address',
        order: 'asc',
      }

      const testError = new Error('Test error fetching DAO member')
      sandbox.stub(SatsumaHelper, '_rpCall').rejects(testError)
      const stubLogger = sandbox.stub(logger, 'error')

      const response = await SatsumaHelper.getTokenVotingMembers(network, '0x...', filters)

      expect(response).to.deep.equal([])
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error fetching TokenVoting members' as any)).to.be.true
    })
  })

  describe('getMultiSigMembers', async () => {
    it('should getMultiSigMembers', async () => {
      const mockDao = DaoList[1]

      const fakeResponse = [
        {
          address: '0x25cd4b8a02a8f9e920eb02fac38c2954694a3fa5',
        },
        {
          address: '0x3ffe3f16d47a54b1c6a3f47c9e6ff5c2c1b32859',
        },
        {
          address: '0x42342037e0fc34c130cdb079139f8ae56d38453f',
        },
        {
          address: '0xaf2c536f9af22548829b20e9afc567259c820c62',
        },
        {
          address: '0xdf62645a2c714febbf6060d1fb607e7eccef0659',
        },
      ]
      const stubRequest = sandbox.stub(SatsumaHelper, '_rpCall').resolves({ multisigApprovers: fakeResponse })
      const network = NetworksEnum.mainnet
      const pluginAddress = mockDao.plugins[0].plugin.pluginAddress as HexAddress
      const filters = {
        limit: 10,
        skip: 0,
        orderProp: 'address',
        order: 'asc',
      }

      const res = await SatsumaHelper.getMultiSigMembers(network, pluginAddress, filters)

      expect(res).to.deep.equal(fakeResponse)
      expect(stubRequest.calledOnce).to.be.true
      expect(stubRequest.args[0][0]).to.eq(network)
      expect(stubRequest.args[0][2]).to.deep.equal({
        where: { plugin: pluginAddress.toLowerCase() },
        limit: filters.limit,
        skip: filters.skip,
        sortBy: filters.orderProp,
        direction: filters.order,
      })
    })

    it('handles error getMultiSigMembers', async () => {
      const mockDao = DaoList[3]
      const pluginAddress = mockDao.plugins[0].plugin.pluginAddress as HexAddress
      const network = NetworksEnum.mainnet
      const filters = {
        limit: 10,
        skip: 0,
        orderProp: 'address',
        order: 'asc',
      }

      const testError = new Error('Test error fetching DAO member')
      sandbox.stub(SatsumaHelper, '_rpCall').rejects(testError)
      const stubLogger = sandbox.stub(logger, 'error')

      const response = await SatsumaHelper.getMultiSigMembers(network, '0x...', filters)

      expect(response).to.deep.equal([])
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error fetching MultiSig members' as any)).to.be.true
    })
  })
})
