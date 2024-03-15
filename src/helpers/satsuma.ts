import logger from '@logger'
import config from '@config'
import request, { gql } from 'graphql-request'
import { parse } from 'graphql'
import {
  EnumPluginType,
  type IDao,
  type IDaoSatsumaResponse,
  type IDaosOfMember,
  type IDaoSubgraph,
  NetworksEnum,
  type SubgraphQueryParam,
} from '@types'
import type { TypedDocumentNode } from '@graphql-typed-document-node/core'
import dayjs from '@helpers/dayjs'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'helpers:SatsumaHelper' })

const SatsumaHelper = {
  graphRequest: request,
  subgraphUrls: {
    [NetworksEnum.arbitrum]: config.SUBGRAPH.SUBGRAPH_ARBITRUM_URI,
    [NetworksEnum.arbitrumGoerli]: config.SUBGRAPH.SUBGRAPH_ARBITRUM_GOERLI_URI,
    [NetworksEnum.base]: config.SUBGRAPH.SUBGRAPH_BASE_URI,
    [NetworksEnum.baseGoerli]: config.SUBGRAPH.SUBGRAPH_BASE_GOERLI_URI,
    [NetworksEnum.ethereum]: config.SUBGRAPH.SUBGRAPH_ETHEREUM_URI,
    [NetworksEnum.goerli]: config.SUBGRAPH.SUBGRAPH_GOERLI_URI,
    [NetworksEnum.mumbai]: config.SUBGRAPH.SUBGRAPH_MUMBAI_URI,
    [NetworksEnum.polygon]: config.SUBGRAPH.SUBGRAPH_POLYGON_URI,
    [NetworksEnum.sepolia]: config.SUBGRAPH.SUBGRAPH_SEPOLIA_URI,
  },

  _rpCall: async <T>(
    network: NetworksEnum,
    query: TypedDocumentNode,
    params: SubgraphQueryParam | any,
  ): Promise<T> => {
    try {
      const response: T = await SatsumaHelper.graphRequest<T>(
        SatsumaHelper.subgraphUrls[network],
        query,
        params,
      )
      return response
    } catch (error) {
      logger.error(
        'Error in SatsumaHelper RPC Call',
        llo({ network, error, params, query }),
      )
      throw error
    }
  },

  getDaosOfMember: async(
    network: NetworksEnum,
    address: string,
  ): Promise<IDaosOfMember> => {
    const query = parse(gql`
      query MultisigApprovers($where: TokenVotingMember_filter!) {
        multisigApprovers(where: $where) {
          plugin {
            dao {
              id
              metadata
              subdomain
              createdAt
              proposals {
                __typename
                id
              }
            }
          }
        }
        tokenVotingMembers(where: $where) {
          plugin {
            dao {
              id
              metadata
              subdomain
              createdAt
              proposals {
                __typename
                id
              }
            }
          }
        }
      }
    `)
    const params: SubgraphQueryParam = {
      where: { address: address.toLowerCase() },
    }

    try {
      const response = await SatsumaHelper._rpCall<any>(network, query, params)
      return {
        tokenVotingMembers: response.tokenVotingMembers,
        multisigApprovers: response.multisigApprovers,
      }
    } catch (error) {
      logger.error(
        'Error fetching DAO member',
        llo({ network, address, error }),
      )
      return {
        tokenVotingMembers: [],
        multisigApprovers: [],
      }
    }
  },

  getDaos: async(
    network: NetworksEnum,
    {
      limit,
      skip,
      orderBy,
      orderDirection,
    }: {
      fromDate?: number
      limit: number
      skip: number
      orderBy?: string
      orderDirection?: string
    },
  ): Promise<IDaoSatsumaResponse> => {
    const query = parse(gql`
      query Daos(
        $where: Dao_filter!
        $first: Int!
        $skip: Int
        $orderBy: String!
        $orderDirection: String!
      ) {
        daos(
          where: $where
          first: $first
          skip: $skip
          orderBy: $orderBy
          orderDirection: $orderDirection
        ) {
          id
          subdomain
          creator
          daoURI
          metadata
          createdAt
          proposals {
            __typename
            id
            executed
          }
          plugins {
            plugin {
              __typename
              ... on TokenVotingPlugin {
                members {
                  votingPower
                }
              }
              ... on MultisigPlugin {
                members {
                  address
                }
              }
            }
          }
        }
      }
    `)

    const params: SubgraphQueryParam = {
      where: {},
      first: limit,
      skip: skip || 0,
      orderBy: orderBy || 'createdAt',
      orderDirection: orderDirection || 'asc',
    }

    try {
      const response = await SatsumaHelper._rpCall<any>(network, query, params)
      const fetchedDaos = response.daos

      const filteredDaos = fetchedDaos
        .map((dao: IDaoSubgraph) => SatsumaHelper._parseDao(dao, network))
        .filter((dao: IDao | undefined) => dao !== undefined)
        .sort((a: IDao, b: IDao) => a.block - b.block)

      let nextCursor = 0
      if (fetchedDaos.length === limit) {
        nextCursor = Number(fetchedDaos[fetchedDaos.length - 1].createdAt)
      }

      return {
        daos: filteredDaos,
        limit,
        skip,
        results: fetchedDaos.length,
        skipResult: fetchedDaos.length - fetchedDaos.length,
        excludedResult: fetchedDaos.length - filteredDaos.length,
        nextCursor,
      }
    } catch (error) {
      logger.error('Error fetching DAOs', llo({ network, params, error }))
      return {
        daos: [],
        limit,
        skip,
        results: 0,
        skipResult: 0,
        excludedResult: 0,
        nextCursor: 0,
      }
    }
  },

  _getPluginInfo: (
    dao: IDaoSubgraph,
  ): { pluginType: EnumPluginType, membersCount: number } | undefined => {
    const pluginType = dao.plugins.find(p =>
      [
        EnumPluginType.MultisigPlugin,
        EnumPluginType.TokenVotingPlugin,
      ].includes(p.plugin?.__typename || 'none'),
    )?.plugin

    if (pluginType?.__typename === EnumPluginType.TokenVotingPlugin) {
      return {
        pluginType: EnumPluginType.TokenVotingPlugin,
        membersCount: pluginType.members.length,
      }
    }

    if (pluginType?.__typename === EnumPluginType.MultisigPlugin) {
      return {
        pluginType: EnumPluginType.MultisigPlugin,
        membersCount: pluginType.members.length,
      }
    }

    return undefined
  },

  _parseDao: (dao: IDaoSubgraph, network: NetworksEnum): IDao | undefined => {
    const plugin = SatsumaHelper._getPluginInfo(dao)

    if (!plugin) {
      return undefined
    }

    return {
      creatorAddress: Web3Utils.parseAddress(dao.creator, {
        ...dao,
        service: 'satsuma',
      })!,
      daoAddress: Web3Utils.parseAddress(dao.id, {
        ...dao,
        service: 'satsuma',
      })!,
      block: Number(dao.createdAt),
      createdAt: dayjs.utc(Number(dao.createdAt) * 1000).toDate(),
      ens: dao.daoURI,
      members: plugin?.membersCount ? Number(plugin.membersCount) : 0,
      metadataIpfs: dao?.metadata,
      network,
      pluginName: plugin?.pluginType || null,
      proposalsCreated: dao.proposals?.length,
      proposalsExecuted: dao.proposals?.filter(p => p.executed).length,
      tvlUSD: 0,
      txHash: utils.zeroAddress,
      uniqueVoters: 0,
      votes: 0,
      hideDao: !plugin?.pluginType,
    }
  },
}

export default SatsumaHelper
