import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'

describe('Model: SafeMember', () => {
  beforeEach(async () => {
    await Models.SafeMember.ensure(NETWORK, SAFE, OWNER)
  })

  it('keeps owner activity but drops plugin metrics from the list', async () => {
    await Models.Member.create({ address: OWNER, ens: 'alice.eth', firstActivity: 100, lastActivity: 200 })
    await Models.PluginMetrics.create({
      network: NETWORK,
      pluginAddress: SAFE,
      memberAddress: OWNER,
      daoAddress: SAFE,
      voteCount: 9,
      firstActivity: 50,
      lastActivity: 300,
    })

    const result = await Models.SafeMember.findAndPaginate({
      paginationParams: { page: 1, pageSize: 10 },
      extraParams: { network: NETWORK, pluginAddress: SAFE },
    })

    expect(result.data).to.have.lengthOf(1)
    expect(result.data[0]).to.include({
      address: OWNER,
      ens: 'alice.eth',
      metrics: null,
      firstActivity: 100,
      lastActivity: 200,
    })
  })

  it('keeps one owner without throwing for another casing outside a session', async () => {
    await expect(Models.SafeMember.ensure(NETWORK, SAFE, OWNER.toLowerCase())).not.to.be.rejected

    const rows = await Models.SafeMember.find({}).lean()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]).to.include({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
  })

  it('throws a duplicate key error for another owner casing inside a session', async () => {
    const error = await DbTx.executeTxFn(
      async ({ session }: { session: ClientSession }) => {
        await Models.SafeMember.ensure(NETWORK, SAFE, OWNER.toLowerCase(), session)
        await DbTx.safeCommit(session)
      },
      { stopRetry: true, throwOnStop: true },
    ).catch(error => error)

    expect(error).to.have.property('code', 11000)
    expect(error.message).to.include('safe_member_unique')
    const rows = await Models.SafeMember.find({}).lean()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]).to.include({ network: NETWORK, safeAddress: SAFE, memberAddress: OWNER })
  })
})
