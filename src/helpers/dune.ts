import logger from '@logger'
import axios from 'axios'
import config from '@config'
import dayjs from '@helpers/dayjs'
import { type IDao, type IDaoDune } from '@types'
import Web3Utils from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'helpers:DuneHelper' })

const DuneHelper = {
  axiosInstance: axios.create({
    baseURL: config.DUNE.URI,
    headers: { 'Content-Type': 'application/json' },
  }),

  _rpCall: async (path: string) => {
    try {
      const url = `${path}?api_key=${config.DUNE.API_KEY}`
      const response = await DuneHelper.axiosInstance.get(url)
      return response
    } catch (error) {
      logger.error('Error in DuneHelper RPC Call', llo({ error }))
      throw error
    }
  },

  // Dune only support base, polygon, ethereum, arbitrum networks
  getDaos: async (): Promise<{ daos: IDao[]; total: number }> => {
    const resp = await DuneHelper._rpCall('/query/3208626/results')

    const { rows: daos, metadata } = resp.data.result

    return {
      daos: daos.map((dao: IDaoDune) => DuneHelper._parseDao(dao)).filter((dao: IDao) => dao?.daoAddress),
      total: metadata?.row_count,
    }
  },

  _parseDao: (dao: IDaoDune): IDao => {
    return {
      creatorAddress: Web3Utils.parseAddress(dao.creator_address, {
        ...dao,
        service: 'dune',
      })!,
      daoAddress: Web3Utils.parseAddress(dao.dao_address, {
        ...dao,
        service: 'dune',
      })!,
      block: Number(dao.block_time),
      createdAt: dayjs.utc(dao.block_time).toDate(),
      permalink: null,
      ens: dao.ens,
      members: dao.members,
      metadataIpfs: dao.metadata_ipfs?.replace(/\0/g, ''),
      network: dao.network,
      links: [],
      plugins: [],
      // pluginName: dao.plugin_name,
      proposalsCreated: dao.proposals_created,
      proposalsExecuted: dao.proposals_executed,
      tvlUSD: dao.tvl_usd, // only from dune
      txHash: dao.tx_hash, // only from dune
      uniqueVoters: dao.unique_voters, // only from dune
      votes: dao.votes, // only from dune
      hideDao: dao.hide_dao || false,
    }
  },
}

export default DuneHelper
