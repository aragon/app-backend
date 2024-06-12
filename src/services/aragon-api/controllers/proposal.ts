import { Models } from '@dbModels'
import { ErrorKeyEnum, type HexAddress, type IPaginatedResult, type IPaginationParams } from '@types'

import { assertExposable } from '@errors'
import type Proposal from '@models/schema/proposal'

const ProposalCtrl = {
  async getByDao(params: IPaginationParams & { permalink: string }): Promise<IPaginatedResult<Proposal>> {
    const dao = await Models.Dao.findByPermalink(params.permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const { data, currentPage, totPages, totRecords } = await Models.Proposal.findByDaoWithPagination(
      {
        daoAddress: dao.address,
      },
      {
        search: params.search,
        toDate: params.toDate,
        fromDate: params.fromDate,
        limit: params.limit,
        skip: params.skip,
        order: params.order,
        orderProp: params.orderProp,
      },
    )

    return {
      metadata: {
        ...params,
        currentPage,
        totPages,
        totRecords,
      },
      data: data.map((proposal: Proposal) => proposal.filterKeys()),
    }
  },

  async getByMember(
    params: IPaginationParams & { permalink: string; memberAddress: HexAddress },
  ): Promise<IPaginatedResult<Proposal>> {
    const dao = await Models.Dao.findByPermalink(params.permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const { data, currentPage, totPages, totRecords } = await Models.Proposal.findByMemberAndDao(
      {
        daoAddress: dao.address,
        memberAddress: params.memberAddress,
      },
      {
        search: params.search,
        toDate: params.toDate,
        fromDate: params.fromDate,
        limit: params.limit,
        skip: params.skip,
        order: params.order,
        orderProp: params.orderProp,
      },
    )

    return {
      metadata: {
        ...params,
        currentPage,
        totPages,
        totRecords,
      },
      data: data.map((proposal: Proposal) => proposal.filterKeys()),
    }
  },
}

export default ProposalCtrl
