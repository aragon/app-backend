import logger from '@logger'
import { type IDao, type IDaoMetadata, type NetworksEnum } from '@types'
import SatsumaHelper from '@helpers/satsuma'
import Network from '@models/schema/network'
import config from '@config'
import mongo from '@modules/mongo'
import IPFSHelper from '@helpers/ipfs'
import type { SaveOptions } from 'mongoose'
import { Models } from '@dbModels'
import DuneHelper from '@helpers/dune'

const llo = logger.logMeta.bind(null, { service: 'service:sync:SyncDao' })

export const SyncDao = {
  duneDaos: [] as IDao[],
  extraLog: {
    totalDaosAllNetworks: 0,
  },

  async fetchAll() {
    const resp = await DuneHelper.getDaos()
    SyncDao.duneDaos = resp.daos

    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Starting DAO fetch', llo({ networkName }))
      await SyncDao._fetchDaosByNetwork(
        networkName as NetworksEnum,
        config.SERVICES.SYNC_DAO.FETCH_BATCH_SIZE,
      )
    }
    logger.verbose('Completed fetching DAOs', llo(SyncDao.extraLog))
    SyncDao._reset()
  },

  async _fetchDaosByNetwork(networkName: NetworksEnum, batchSize: number) {
    let skip: number = 0
    let continueFetching = true

    SyncDao.extraLog[networkName] = {
      totalDaos: 0,
      includedDaos: 0,
      excludedDaos: 0,
      metadataFetched: 0,
      metadataFetchFailed: 0,
      metadataInvalid: 0,
    }

    while (continueFetching) {
      const result = await SatsumaHelper.getDaos(networkName, {
        skip,
        limit: batchSize,
      })

      await Promise.all(
        result.daos.map(async(dao, index) => {
          SyncDao.extraLog.totalDaosAllNetworks += 1
          SyncDao.extraLog[networkName].totalDaos += 1
          if (dao.hideDao) {
            SyncDao.extraLog[networkName].excludedDaos += 1
          } else {
            SyncDao.extraLog[networkName].includedDaos += 1
          }

          let metadata: IDaoMetadata | null = null
          if (IPFSHelper.isValidIpfsUrl(dao?.metadataIpfs!)) {
            metadata = await IPFSHelper.fetchMetadata(
              dao?.metadataIpfs!,
              networkName,
            )

            if (metadata) {
              SyncDao.extraLog[networkName].metadataFetched += 1
            } else {
              SyncDao.extraLog[networkName].metadataFetchFailed += 1
            }
          } else {
            SyncDao.extraLog[networkName].metadataInvalid += 1
          }

          await SyncDao._createOrUpdate(dao, networkName, metadata!)
        }),
      )

      if (!result.nextCursor) {
        continueFetching = false
      } else {
        skip = skip + batchSize
      }
    }
    logger.verbose(
      'DAO Metrics ',
      llo(SyncDao.extraLog[networkName], { networkName }),
    )
  },

  async _createOrUpdate(
    dao: IDao,
    networkName: NetworksEnum,
    metadata?: IDaoMetadata,
  ) {
    await mongo.executeTxFn(async(tOpts: SaveOptions) => {
      const duneDao = SyncDao.duneDaos.find(
        d => d.daoAddress === dao.daoAddress && d.network === networkName,
      )

      const rawDao: any = {
        name: metadata?.name,
        logo: metadata?.avatar,
        description: metadata?.description,
        links: metadata?.links || [],
        creatorAddress: dao.creatorAddress,
        daoAddress: dao.daoAddress,
        ens: duneDao?.ens ?? dao?.ens,
        members: dao.members || 0,
        metadataIpfs: dao.metadataIpfs,
        network: networkName as NetworksEnum,
        pluginName: dao.pluginName,
        proposalsCreated: dao.proposalsCreated,
        proposalsExecuted: dao.proposalsExecuted,
        tvlUSD: duneDao?.tvlUSD ?? dao.tvlUSD,
        txHash: duneDao?.txHash ?? dao.txHash,
        uniqueVoters: duneDao?.uniqueVoters ?? dao.uniqueVoters,
        votes: duneDao?.votes ?? dao.votes,
        hideDao: dao.hideDao,
        createdAt: dao.createdAt,
      }

      const existingDao = await Models.Dao.findByDaoAddressAndNetwork(
        dao.daoAddress,
        networkName,
      )

      if (existingDao) {
        existingDao.update(rawDao, tOpts)
      } else {
        await Models.Dao.create(rawDao, tOpts)
      }

      await tOpts?.session?.commitTransaction()
      tOpts?.session?.endSession()
    })
  },

  _reset() {
    SyncDao.duneDaos = []
    SyncDao.extraLog = {
      totalDaosAllNetworks: 0,
    }
  },
}
