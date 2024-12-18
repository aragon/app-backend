import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import { NetworksEnum } from '@types'

describe('Model/Utils: aggregation', () => {
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
          daoAddress: '0xDaoAddress',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
        'memberMappings',
      )

      console.log('Generated Query:', JSON.stringify(query, null, 2)) // Log the query for debugging

      expect(query).to.deep.equal({
        $lookup: {
          from: 'DaoMemberMapping',
          let: {
            tokenAddress: '0xTokenAddress',
            memberAddress: '0xMemberAddress',
            daoAddress: '0xDaoAddress',
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
                    { $eq: ['$daoAddress', '$$daoAddress'] },
                    { $eq: ['$memberAddress', '$$memberAddress'] },
                    { $eq: ['$network', '$$network'] },
                  ],
                },
              },
            },
            {
              $project: {
                daoAddress: 1,
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

      expect(query).to.deep.equal({
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
                    {
                      $in: ['$proposalIndex', '$$proposalIndex'],
                    },
                    {
                      $in: ['$pluginAddress', '$$pluginAddress'],
                    },
                    {
                      $eq: ['$network', '$$network'],
                    },
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
                        $and: [
                          {
                            $eq: ['$address', '$$address'],
                          },
                          {
                            $eq: ['$network', '$$network'],
                          },
                        ],
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
                      type: 1,
                      totalSupply: 1,
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
                    {
                      token: {
                        $arrayElemAt: ['$token', 0],
                      },
                    },
                    {
                      historicalMembersCount: '$snapshot.membersCount',
                    },
                    {
                      historicalTotalSupply: '$snapshot.totalSupply',
                    },
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
                actions: 1,
                media: 1,
                metrics: 1,
                settings: 1,
              },
            },
          ],
          as: 'proposals',
        },
      })
    })
  })
})
