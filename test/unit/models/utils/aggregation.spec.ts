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
})
