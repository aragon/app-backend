import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import logger from '@logger'
import type Member from '@models/schema/member'
import DbTx from '@modules/dbTx'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: ToolsEnsFetch' })

export interface IExtendedService extends IService {
  fetchEns: (member: Member) => Promise<Member | null>
}

export const ToolsEnsFetch: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    let count = 0
    const members = await Models.Member.find({ ens: { $ne: null } })

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
    const ens = await EnsHelper.getEnsWithUniversalResolver(member.address)

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
