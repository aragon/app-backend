import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Member from '@models/schema/member'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeMember } from '@test/mock/fakeMember'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import Plugin from '@models/schema/plugin'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { FakeMemberMetrics } from '@test/mock/fakeMemberMetrics'
import { fakeMemberBalance } from '@test/mock/fakeMemberBalance'

import { PluginList } from '@test/mock/fakePlugins'
import MemberBalance from '@models/schema/memberBalance'
import MemberMetrics from '@models/schema/memberMetrics'
import { IPluginInterfaceType } from '@types'

describe('Model: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawDaoMapping: Partial<DaoMemberMapping>
  let rawPlugin: Partial<Plugin>
  let rawMemberBalance: Partial<MemberBalance>
  let rawMemberMetrics: Partial<MemberMetrics>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      ...FakeMember,
    } as any

    rawDaoMapping = {
      ...FakeDaoMemberMappings[0],
      memberAddress: rawMember.address,
    }

    rawPlugin = {
      ...PluginList[0],
      daoAddress: rawDaoMapping.daoAddress,
      interfaceType: IPluginInterfaceType.multisig,
    } as any

    rawMemberBalance = {
      ...fakeMemberBalance,
      address: FakeMember.address,
      tokenAddress: rawPlugin.tokenAddress,
    }

    rawMemberMetrics = {
      ...FakeMemberMetrics,
      address: rawMember.address,
      pluginAddress: rawPlugin.address,
    }

    await Models.MemberBalance.create(rawMemberBalance)
    await Models.DaoMemberMapping.create(rawDaoMapping)
    await Models.Plugin.create(rawPlugin)
    await Models.MemberMetrics.create(rawMemberMetrics)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Member', async () => {
    const entityId = Models.Member.getEntityId({ address: rawMember.address! })
    const member = await Models.Member.create(rawMember)
    expect(member.id).to.eq(entityId)
    expect(member.address).to.eq(rawMember.address)
    expect(member.ens).to.eq(rawMember.ens)
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const entityId = Models.Member.getEntityId({ address })
    expect(entityId).to.eq(`${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findExistingLog({
      address: createdLogDao.address!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEns', async () => {
    const createdMember = await Models.Member.create(rawMember)
    const member = await Models.Member.findByEns(createdMember.ens)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should findByAddress', async () => {
    const createdMember = await Models.Member.create(rawMember)
    const member = await Models.Member.findByAddress(createdMember.address)
    expect(member?.address).to.eq(createdMember.address)
  })

  it('should update Member', async () => {
    const member = await Models.Member.create(rawMember)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdMember = await Models.Member.create(rawMember)
    await createdMember.reload()

    expect(createdMember.address).to.eq(rawMember.address)
  })

  describe('findMemberByAddress', () => {
    it('should find member by address only', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const member = await Models.Member.findMemberByAddress(createdMember.address)

      expect(member?.address).to.eq(createdMember.address)
    })

    it('should return all the details of the member if passed extra params', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const member = await Models.Member.findMemberByAddress(createdMember.address, {
        daoAddress: rawDaoMapping.daoAddress,
        network: rawDaoMapping.network,
        pluginAddress: rawPlugin.address,
        tokenAddress: rawPlugin.tokenAddress,
      })

      expect(member?.address).to.eq(createdMember.address)
      expect(member.tokenBalance).to.be.eq(rawMemberBalance.amount)
      expect(member.votingPower).to.be.eq(rawMemberBalance.votingPower)
      expect(member.metrics).to.be.exist
      expect(member.metrics?.delegateReceivedCount).to.be.eq(rawMemberMetrics.delegateReceivedCount)
    })
  })

  describe('findWithPagination', () => {
    it('should find member with pagination', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const member = await Models.Member.findWithPagination({
        extraParams: {
          daoAddress: rawDaoMapping.daoAddress,
        },
        paginationParams: {},
      })

      const {
        data,
        metadata: { totalPages, totalRecords, page, pageSize },
      } = member

      expect(data.length).to.be.eq(1)
      expect(totalPages).to.be.eq(1)
      expect(totalRecords).to.be.eq(1)
      expect(page).to.be.eq(1)
      expect(pageSize).to.be.eq(10)

      expect(data[0].address).to.be.eq(createdMember.address)
    })

    it('should not find any records if not exist', async () => {
      const member = await Models.Member.findWithPagination({
        extraParams: {
          daoAddress: rawDaoMapping.daoAddress,
        },
        paginationParams: {},
      })

      const {
        data,
        metadata: { totalPages, totalRecords, page, pageSize },
      } = member

      expect(data.length).to.be.eq(0)
      expect(totalPages).to.be.eq(1)
      expect(totalRecords).to.be.eq(0)
      expect(page).to.be.eq(1)
      expect(pageSize).to.be.eq(10)
    })
  })
})
