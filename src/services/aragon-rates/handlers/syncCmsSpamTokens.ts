import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type ICmsSpamTokens } from '@types'
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'rates:SyncCmsSpamTokens' })

export const SyncCmsSpamTokens = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start SyncCmsSpamTokens', llo({ startTime }))

    try {
      const cmsData = await SyncCmsSpamTokens.fetchCmsData()

      if (!cmsData) {
        logger.warn('Failed to fetch CMS spam tokens data', llo({}))
        return
      }

      const cmsIds = SyncCmsSpamTokens.buildTokenIds(cmsData)

      let markedSpam = 0
      let unmarkedSpam = 0

      if (cmsIds.length > 0) {
        const toMarkCount = await Models.Token.countDocuments({ id: { $in: cmsIds }, isSpam: false })
        if (toMarkCount > 0) {
          const markResult = await Models.Token.updateMany(
            { id: { $in: cmsIds }, isSpam: false },
            { $set: { isSpam: true, spamSource: 'cms' } },
          )
          markedSpam = markResult.modifiedCount
        }
      }

      const toUnmarkCount = await Models.Token.countDocuments({ spamSource: 'cms', id: { $nin: cmsIds } })
      if (toUnmarkCount > 0) {
        const unmarkResult = await Models.Token.updateMany(
          { spamSource: 'cms', id: { $nin: cmsIds } },
          { $set: { isSpam: false, spamSource: null } },
        )
        unmarkedSpam = unmarkResult.modifiedCount
      }

      const duration = Date.now() - startTime
      logger.verbose(
        'End SyncCmsSpamTokens',
        llo({
          cmsCount: cmsIds.length,
          markedSpam,
          unmarkedSpam,
          duration: `${duration}ms`,
        }),
      )
    } catch (error) {
      logger.error('Error SyncCmsSpamTokens', llo({ error }))
    }
  },

  fetchCmsData: async (): Promise<ICmsSpamTokens | null> => {
    try {
      const response = await axios.get<ICmsSpamTokens>(config.SERVICES.ARAGON_RATES.CMS_SPAM_TOKENS_URL)
      return response.data
    } catch (error) {
      logger.error('Error fetching CMS spam tokens', llo({ error }))
      return null
    }
  },

  buildTokenIds: (networkTokens: ICmsSpamTokens): string[] => {
    return Object.entries(networkTokens).flatMap(([network, addresses]) =>
      (addresses || []).map(addr => `${addr.toLowerCase()}-${network}`),
    )
  },
}
