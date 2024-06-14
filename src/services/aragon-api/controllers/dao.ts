import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IDaoResponse,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPluginResponse,
  type IPluginSubdomain,
  type IProposalResponse,
  type ITransactionResponse,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'
import type Proposal from '@models/schema/proposal'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams,
    { network, pluginAddress },
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    const result = await Models.Dao.findWithPagination(
      { networks: network ? [network] : [], pluginAddress },
      paginationParams,
    )
    result.data = result.data.map((dao: Dao) => dao.filterKeys())
    return result
  },

  getDaoByPermalink: async (permalink: string): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoPlugin: async ({ permalink, pluginAddress }): Promise<IPluginResponse> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find(
      (w: { subdomain: IPluginSubdomain; address: string }) => w.address === pluginAddress,
    )
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const plugin = await Models.Plugin.findByAddress(pluginAddress)

    return plugin.filterKeys()
  },

  getDaoMembersWithPagination: async (
    paginationParams: IPaginationParams,
    { permalink, pluginAddress },
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return await Models.Member.findWithPagination({ daoAddress: dao.address, pluginAddress }, paginationParams)
  },

  getDaoProposalsWithPagination: async (
    paginationParams: IPaginationParams,
    { permalink, pluginAddress },
  ): Promise<IPaginatedResult<IProposalResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const result = await Models.Proposal.findWithPagination(
      { daoAddress: dao.address, pluginAddress },
      paginationParams,
    )

    result.data = result.data.map((proposal: Proposal) => proposal.filterKeys())
    return result
  },

  getDaoAssetsWithPagination: async (
    paginationParams: IPaginationParams,
    { permalink },
  ): Promise<IPaginatedResult<any>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return await Models.Asset.findWithPagination({ daoAddress: dao.address }, paginationParams)
  },

  getDaoTransactionsWithPagination: async (
    paginationParams: IPaginationParams,
    { permalink },
  ): Promise<IPaginatedResult<ITransactionResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return await Models.Transaction.findWithPagination({ daoAddress: dao.address }, paginationParams)
  },
}

export default DaoController
