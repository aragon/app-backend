import { EnumConnection, type IService, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Utils from '@helpers/utils'
import EnsHelper from '@helpers/ens'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'tools:fixSettingIssue' })

export const FixEnsOnDao: IService & { onDocument: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  start: async () => {
    const daoCrawler = new DBCrawler({
      model: Models.Dao,
      where: {
        network: NetworksEnum.ethereumMainnet,
        ens: { $eq: null },
        subdomain: { $ne: null },
      },
      limit: 1000,
      concurrency: 100,
      onError: (error: any, document: any) => {
        logger.error(
          'Error Dao Fix Ens',
          llo({
            error,
            document,
          }),
        )
      },
      onDocument: FixEnsOnDao.onDocument,
    })

    await daoCrawler.crawl()
  },

  onDocument: async (dao: any) => {
    const validSubdomain = Utils.validateString(dao.subdomain)
    const ens = validSubdomain
      ? await EnsHelper.getDaoEns({ daoAddress: dao.address, subdomain: validSubdomain })
      : null
    if (ens) {
      await DbOperations.updateDocument(dao, { ens }, { dao: dao.id, ens }, 'FixEnsOnDao', llo)
    } else {
      logger.error(
        'Error Dao Fix Ens',
        llo({
          message: 'No ens found',
          dao: dao.address,
          subdomain: dao.subdomain,
          validSubdomain,
        }),
      )
    }

    await Utils.wait(500)
  },

  stop: () => {},
}
