import logger from '@logger'
import config from '@config'
import request, { gql } from 'graphql-request'
import { parse } from 'graphql'
import {
  EnumPluginType,
  type HexAddress,
  type IDao,
  type IDaoMultiSigMember,
  type IDaoSatsumaResponse,
  type IDaoSubgraph,
  type IDaoTokenVotingMember,
  type IPaginationParams,
  type IPlugin,
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
    [NetworksEnum.base]: config.SUBGRAPH.SUBGRAPH_BASE_URI,
    [NetworksEnum.mainnet]: config.SUBGRAPH.SUBGRAPH_ETHEREUM_URI,
    [NetworksEnum.polygon]: config.SUBGRAPH.SUBGRAPH_POLYGON_URI,
    [NetworksEnum.sepolia]: config.SUBGRAPH.SUBGRAPH_SEPOLIA_URI,
  },

  _rpCall: async <T>(network: NetworksEnum, query: TypedDocumentNode, params: SubgraphQueryParam | any): Promise<T> => {
    try {
      const response: T = await SatsumaHelper.graphRequest<T>(SatsumaHelper.subgraphUrls[network], query, params)
      return response
    } catch (error) {
      logger.error('Error in SatsumaHelper RPC Call', llo({ network, error, params, query }))
      throw error
    }
  },

  getTokenVotingMembers: async (
    network: NetworksEnum,
    pluginAddress: HexAddress,
    { limit = 100, skip = 0, orderProp = 'address', order = 'asc' }: IPaginationParams,
  ): Promise<IDaoTokenVotingMember[]> => {
    const query = parse(gql`
      query TokenVotingMembers(
        $where: TokenVotingMember_filter!
        $limit: Int!
        $skip: Int!
        $sortBy: TokenVotingMember_orderBy!
        $direction: OrderDirection!
      ) {
        tokenVotingMembers(where: $where, first: $limit, skip: $skip, orderBy: $sortBy, orderDirection: $direction) {
          address
          balance
          votingPower
          delegatee {
            address
          }
          delegators {
            address
            balance
          }
        }
      }
    `)

    const variables = {
      where: { plugin: pluginAddress.toLowerCase() },
      limit,
      skip,
      sortBy: orderProp,
      direction: order,
    }

    try {
      const response = await SatsumaHelper._rpCall<any>(network, query, variables)
      return response.tokenVotingMembers
    } catch (error) {
      logger.error('Error fetching TokenVoting members', llo({ network, error }))
      return []
    }
  },

  getMultiSigMembers: async (
    network: NetworksEnum,
    pluginAddress: HexAddress,
    { limit = 100, skip = 0, orderProp = 'address', order = 'asc' }: IPaginationParams,
  ): Promise<IDaoMultiSigMember[]> => {
    const query = parse(gql`
      query MultisigMembers(
        $where: MultisigApprover_filter!
        $limit: Int!
        $skip: Int!
        $sortBy: MultisigApprover_orderBy!
        $direction: OrderDirection!
      ) {
        multisigApprovers(where: $where, first: $limit, skip: $skip, orderBy: $sortBy, orderDirection: $direction) {
          address
        }
      }
    `)

    const variables = {
      where: { plugin: pluginAddress.toLowerCase() },
      limit,
      skip,
      sortBy: orderProp,
      direction: order,
    }

    try {
      const response = await SatsumaHelper._rpCall<any>(network, query, variables)
      return response.multisigApprovers
    } catch (error) {
      logger.error('Error fetching MultiSig members', llo({ network, error }))
      return []
    }
  },

  getDaos: async (
    network: NetworksEnum,
    { limit = 100, skip = 0, orderProp = 'address', order = 'asc' }: IPaginationParams,
  ): Promise<IDaoSatsumaResponse> => {
    const query = parse(gql`
      query Daos($where: Dao_filter!, $first: Int!, $skip: Int, $orderBy: String!, $orderDirection: String!) {
        daos(where: $where, first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
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
              pluginAddress
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
      skip,
      orderBy: orderProp,
      orderDirection: order,
    }

    try {
      const response = await SatsumaHelper._rpCall<any>(network, query, params)
      const fetchedDaos = response.daos

      const filteredDaos = fetchedDaos
        .map((dao: IDaoSubgraph) => SatsumaHelper._parseDao(dao, network))
        .filter((dao: IDao | undefined) => dao !== undefined)

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

  _parsePlugins: (
    dao: IDaoSubgraph,
  ): {
    type: EnumPluginType
    membersCount: number
    address: HexAddress
  }[] => {
    if (!Array.isArray(dao.plugins) || dao.plugins.length === 0) {
      logger.warn('Invalid DAO plugins structure', llo({ dao }))
      return []
    }

    return dao.plugins.reduce<
      Array<{
        type: EnumPluginType
        membersCount: number
        address: HexAddress
      }>
    >((acc, { plugin }) => {
      if (!plugin?.__typename || !plugin.pluginAddress) {
        return acc
      }

      // Only process specified plugin types
      if ([EnumPluginType.MultisigPlugin, EnumPluginType.TokenVotingPlugin].includes(plugin.__typename)) {
        acc.push({
          address: plugin.pluginAddress,
          type: plugin.__typename as EnumPluginType,
          membersCount: Array.isArray(plugin?.members) ? plugin?.members.length : 0,
        })
      }

      return acc
    }, [])
  },

  _parseDao: (dao: IDaoSubgraph, network: NetworksEnum): IDao | undefined => {
    const plugins = SatsumaHelper._parsePlugins(dao)

    if (plugins?.length === 0) {
      return undefined
    }

    const totalMembers = plugins.reduce((sum, plugin) => sum + plugin.membersCount, 0)

    const parsedPlugins = plugins.map(
      p =>
        ({
          type: p.type,
          address: p.address,
        }) as unknown as IPlugin,
    )

    return {
      avatar: null,
      description: null,
      name: null,
      permalink: null,
      links: [],
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
      members: totalMembers,
      metadataIpfs: dao?.metadata,
      network,
      plugins: parsedPlugins,
      proposalsCreated: dao.proposals?.length,
      proposalsExecuted: dao.proposals?.filter(p => p.executed).length,
      tvlUSD: 0,
      txHash: utils.zeroAddress,
      uniqueVoters: 0,
      votes: 0,
      hideDao: plugins?.length === 0,
    }
  },
}

export default SatsumaHelper
