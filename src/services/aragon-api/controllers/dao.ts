import { Models } from '@dbModels'
import { ErrorKeyEnum, type IMembersResponse, type IPaginatedResult, type IPluginSubdomain } from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'
import type Proposal from '@models/schema/proposal'

const DaoController = {
  getDaosWithPagination: async ({ network, pluginAddress, opts }): Promise<IPaginatedResult<Dao>> => {
    const result = await Models.Dao.findWithPagination({ networks: network ? [network] : [], pluginAddress }, opts)
    result.data = result.data.map((dao: Dao) => dao.filterKeys())
    return result
  },

  getDaoByPermalink: async (permalink: string): Promise<Dao> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoPlugin: async ({ permalink, pluginAddress }): Promise<any> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find(
      (w: { subdomain: IPluginSubdomain; address: string }) => w.address === pluginAddress,
    )
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const plugin = await Models.Plugin.findByAddress(pluginAddress)

    return plugin.filterKeys()
  },

  getDaoMembersWithPagination: async ({
    permalink,
    pluginAddress,
    opts,
  }): Promise<IPaginatedResult<IMembersResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return await Models.Member.findWithPagination({ daoAddress: dao.address, pluginAddress }, opts)
  },

  getDaoProposalsWithPagination: async ({
    permalink,
    pluginAddress,
    opts,
  }): Promise<IPaginatedResult<IMembersResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const result = await Models.Proposal.findWithPagination({ daoAddress: dao.address, pluginAddress }, opts)

    result.data = result.data.map((proposal: Proposal) => proposal.filterKeys())
    return result
  },
}

export default DaoController
