import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import logger from '@logger'
import type Member from '@models/schema/member'
import DbTx from '@modules/dbTx'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: ToolsEnsFetch' })
const ENS_V2_LAUNCH_DATE = new Date('2026-10-27T00:00:00Z')

export interface IExtendedService extends IService {
  fetchEns: (member: Member) => Promise<Member | null>
}

export const ToolsEnsFetch: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    let count = 0
    const members = await Models.Member.find({ ens: null, updatedAt: { $gte: ENS_V2_LAUNCH_DATE } })

    await Promise.all(
      members.map(async (member: Member) => {
        const newMember = await ToolsEnsFetch.fetchEns(member)
        count++
        logger.info(`Member ${count} of ${members.length}`, llo({ address: newMember?.address, ens: newMember?.ens }))
      }),
    )

    logger.info('End fetchEns', llo())
  },

  fetchEns: async (member: Member): Promise<Member | null> => {
    const ens = await EnsHelper.getEnsWithUniversalResolver(member.address).catch(error => {
      logger.error('Error fetching member ENS', llo({ address: member.address, error }))
      return null
    })

    if (ens) {
      return await DbTx.executeTxFn(async ({ session }) => {
        member.ens = ens
        const logDb = await member.save({ session })
        await session.commitTransaction()
        await session.endSession()
        return logDb
      })
    }

    return null
  },

  stop: async () => {},
}

export default ToolsEnsFetch
