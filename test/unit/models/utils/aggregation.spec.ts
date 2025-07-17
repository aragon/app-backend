import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import { IPluginStatus, ITransferSide, ITransferType, NetworksEnum } from '@types'

describe('AggregationQueryHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('dao', () => {
    it('should construct a valid aggregation query for dao', () => {
      const query = AggregationQueryHelper.dao(
        { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet },
        'daoInfo',
        { name: 1, address: 1 },
      )

      expect(query).to.deep.equal({
        $lookup: {
          from: 'Dao',
          let: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$address'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
            {
              $project: { name: 1, address: 1 },
            },
          ],
          as: 'daoInfo',
        },
      })
    })

    it('should handle missing project fields', () => {
      const query = AggregationQueryHelper.dao(
        { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet },
        'daoInfo',
      )

      expect(query).to.deep.equal({
        $lookup: {
          from: 'Dao',
          let: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$address'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
          ],
          as: 'daoInfo',
        },
      })
    })
  })

  describe('daoMemberMapping', () => {
    it('should construct a valid aggregation query for daoMemberMapping', () => {
      const query = AggregationQueryHelper.daoMemberMapping(
        {
          tokenAddress: '0xTokenAddress',
          memberAddress: '0xMemberAddress',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
        'memberMappings',
      )

      expect(query).to.deep.equal({
        $lookup: {
          from: 'DaoMemberMapping',
          let: {
            tokenAddress: '0xTokenAddress',
            memberAddress: '0xMemberAddress',
            pluginAddress: '0xPluginAddress',
            network: NetworksEnum.ethereumMainnet,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$pluginAddress', '$$pluginAddress'] },
                    { $eq: ['$tokenAddress', '$$tokenAddress'] },
                    { $eq: ['$memberAddress', '$$memberAddress'] },
                    { $eq: ['$network', '$$network'] },
                  ],
                },
              },
            },
            {
              $project: {
                memberAddress: 1,
                pluginAddress: 1,
                tokenAddress: 1,
                network: 1,
              },
            },
          ],
          as: 'memberMappings',
        },
      })
    })
  })

  describe('proposals', () => {
    it('should construct a valid aggregation query for proposals', () => {
      const query = AggregationQueryHelper.proposals({
        proposalIndex: '1',
        pluginAddress: '0xPlugin1',
        network: NetworksEnum.ethereumMainnet,
      })

      const expectedQuery = {
        $lookup: {
          from: 'Proposal',
          let: {
            proposalIndex: '1',
            pluginAddress: '0xPlugin1',
            network: NetworksEnum.ethereumMainnet,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$proposalIndex', '$$proposalIndex'] },
                    { $in: ['$pluginAddress', '$$pluginAddress'] },
                    { $eq: ['$network', '$$network'] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'Token',
                let: {
                  address: '$settings.tokenAddress',
                  network: '$$network',
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [{ $eq: ['$address', '$$address'] }, { $eq: ['$network', '$$network'] }],
                      },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      network: 1,
                      address: 1,
                      symbol: 1,
                      name: 1,
                      decimals: 1,
                      logo: 1,
                      isGovernance: 1,
                      ignoreTransfer: 1,
                      hasDelegate: 1,
                      underlying: 1,
                      type: 1,
                      totalSupply: 1,
                      mintableByDao: 1,
                    },
                  },
                ],
                as: 'token',
              },
            },
            {
              $addFields: {
                settings: {
                  $mergeObjects: [
                    '$settings',
                    { token: { $arrayElemAt: ['$token', 0] } },
                    { historicalMembersCount: '$snapshot.membersCount' },
                    { historicalTotalSupply: '$snapshot.totalSupply' },
                  ],
                },
              },
            },
            {
              $addFields: {
                token: '$$REMOVE',
              },
            },
            {
              $project: {
                _id: 0,
                id: 1,
                network: 1,
                transactionHash: 1,
                blockNumber: 1,
                blockTimestamp: 1,
                proposalIndex: 1,
                incrementalId: 1,
                stageIndex: 1,
                lastStageTransition: 1,
                creator: 1,
                parentProposal: 1,
                pluginAddress: 1,
                pluginSubdomain: 1,
                daoAddress: 1,
                startDate: 1,
                endDate: 1,
                metadataUri: 1,
                title: 1,
                description: 1,
                summary: 1,
                resources: 1,
                executed: 1,
                hasActions: AggregationQueryHelper.computeHasActions(),
                decoding: 1,
                media: 1,
                metrics: 1,
                settings: 1,
              },
            },
          ],
          as: 'proposals',
        },
      }

      expect(query).to.deep.equal(expectedQuery)
    })
  })

  describe('plugin', () => {
    it('should construct a valid aggregation query for plugin', () => {
      const query = AggregationQueryHelper.plugin(
        {
          addresses: ['0xPlugin1', '0xPlugin2'],
          network: NetworksEnum.ethereumMainnet,
          status: IPluginStatus.installed,
        },
        'plugins',
      )

      const expectedQuery = {
        $lookup: {
          from: 'Plugin',
          let: {
            addresses: ['0xPlugin1', '0xPlugin2'],
            network: NetworksEnum.ethereumMainnet,
            status: IPluginStatus.installed,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$address', '$$addresses'] },
                    { $eq: ['$network', '$$network'] },
                    { $eq: ['$status', '$$status'] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'PluginSlug',
                let: {
                  pluginAddress: '$address',
                  network: '$network',
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [{ $eq: ['$pluginAddress', '$$pluginAddress'] }, { $eq: ['$network', '$$network'] }],
                      },
                    },
                  },
                ],
                as: 'pluginSlug',
              },
            },
            {
              $addFields: {
                slug: {
                  $cond: {
                    if: { $gt: [{ $size: '$pluginSlug' }, 0] },
                    then: { $arrayElemAt: ['$pluginSlug.slug', 0] },
                    else: null,
                  },
                },
              },
            },
            {
              $unset: 'pluginSlug',
            },
          ],
          as: 'plugins',
        },
      }

      expect(query).to.deep.equal(expectedQuery)
    })
  })

  describe('token', () => {
    it('should construct a valid aggregation query for token', () => {
      const query = AggregationQueryHelper.token(
        { address: '0xTokenAddress', network: NetworksEnum.ethereumMainnet },
        'tokens',
        { symbol: 1, name: 1 },
      )

      expect(query).to.deep.equal({
        $lookup: {
          from: 'Token',
          let: { address: '0xTokenAddress', network: NetworksEnum.ethereumMainnet },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$address'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
            {
              $project: { symbol: 1, name: 1 },
            },
          ],
          as: 'tokens',
        },
      })
    })
  })

  describe('memberCountByToken', () => {
    it('should construct a valid aggregation query for memberCountByToken', () => {
      const query = AggregationQueryHelper.memberCountByToken('0xToken', NetworksEnum.ethereumMainnet)

      expect(query).to.deep.equal([
        {
          $match: {
            address: '0xToken',
            network: NetworksEnum.ethereumMainnet,
          },
        },
        {
          $lookup: {
            from: 'Plugin',
            let: { tNetwork: '$network', tAddress: '$address' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$tokenAddress', '$$tAddress'] }, { $eq: ['$network', '$$tNetwork'] }],
                  },
                },
              },
              {
                $lookup: {
                  from: 'DaoMemberMapping',
                  let: { pluginAddr: '$address' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $eq: ['$pluginAddress', '$$pluginAddr'],
                        },
                      },
                    },
                    {
                      $count: 'memberCount',
                    },
                  ],
                  as: 'daoMembers',
                },
              },
              {
                $set: {
                  memberCount: {
                    $ifNull: [{ $arrayElemAt: ['$daoMembers.memberCount', 0] }, 0],
                  },
                },
              },
            ],
            as: 'plugin',
          },
        },
        {
          $set: {
            memberCount: {
              $sum: '$plugin.memberCount',
            },
          },
        },
        {
          $project: {
            _id: 0,
            address: 1,
            memberCount: 1,
          },
        },
      ])
    })
  })

  describe('memberTransactions', () => {
    it('should construct a valid aggregation query for memberTransactions', () => {
      const response = AggregationQueryHelper.memberTransaction(
        {
          memberAddress: '0xMemberAddress',
          tokenAddress: '0xtoken',
          network: NetworksEnum.ethereumMainnet,
          type: ITransferType.tokenTransfer,
          side: ITransferSide.outgoing,
        },
        'memberTransaction',
        {
          transactionHash: 1,
          blockNumber: 1,
          address: 1,
          from: 1,
          to: 1,
        },
        {
          blockNumber: -1,
        },
        1,
      )

      expect(response).to.deep.eq({
        $lookup: {
          from: 'MemberTransaction',
          let: {
            network: 'ethereum-mainnet',
            type: 'tokenTransfer',
            side: 'outgoing',
            address: '0xMemberAddress',
            tokenAddress: '0xtoken',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$$network', '$network'],
                    },
                    {
                      $eq: ['$$type', '$type'],
                    },
                    {
                      $eq: ['$$side', '$side'],
                    },
                    {
                      $eq: ['$$address', '$address'],
                    },
                    {
                      $eq: ['$$tokenAddress', '$tokenAddress'],
                    },
                  ],
                },
              },
            },
            {
              $sort: {
                blockNumber: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                transactionHash: 1,
                blockNumber: 1,
                address: 1,
                from: 1,
                to: 1,
              },
            },
          ],
          as: 'memberTransaction',
        },
      })
    })
  })
})
