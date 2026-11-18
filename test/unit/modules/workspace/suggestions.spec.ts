import WorkspaceController from '@api/controllers/workspace'
import { Models } from '@dbModels'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { expect } from 'chai'

const wallet = '0x0000000000000000000000000000000000000011'
const other = '0x0000000000000000000000000000000000000022'
const network = NetworksEnum.ethereumMainnet
const polygon = NetworksEnum.polygonMainnet
const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`

async function dao(n: number, creatorAddress = other, options: Record<string, unknown> = {}, chain = network) {
  return Models.Dao.create({
    address: address(n),
    network: chain,
    creatorAddress,
    isActive: true,
    name: `DAO ${n}`,
    ...options,
  })
}

async function plugin(n: number, daoAddress: string, interfaceType: IPluginInterfaceType, extras = {}) {
  return Models.Plugin.create({
    address: address(n),
    daoAddress,
    network,
    transactionHash: address(n + 1000),
    blockNumber: 1,
    interfaceType,
    status: IPluginStatus.installed,
    isSupported: true,
    ...extras,
  })
}

describe('Account suggestions', () => {
  it('lists creator DAOs before member DAOs, without duplicates, and keeps V2 DAO data', async () => {
    const created = await dao(101, wallet)
    const both = await dao(102, wallet)
    const member = await dao(103)
    await plugin(201, both.address, IPluginInterfaceType.multisig)
    await plugin(202, member.address, IPluginInterfaceType.multisig)
    await Models.PluginMember.create({
      memberAddress: wallet,
      pluginAddress: address(201),
      daoAddress: both.address,
      network,
    })
    await Models.PluginMember.create({
      memberAddress: wallet,
      pluginAddress: address(202),
      daoAddress: member.address,
      network,
    })
    await dao(104, wallet, { isHidden: true })
    await dao(105, wallet, { isActive: false })

    const result = await WorkspaceController.getSuggestions(wallet, { page: 1, pageSize: 2 })
    expect(result.metadata).to.deep.equal({ page: 1, pageSize: 2, totalPages: 2, totalRecords: 3 })
    expect(result.data.map(item => [item.account.address, item.role])).to.deep.equal([
      [created.address, 'creator'],
      [both.address, 'creator'],
    ])
    const v2 = await Models.Dao.findWithPagination({
      extraQueryData: {
        daoPairs: [
          { daoAddress: created.address, network },
          { daoAddress: both.address, network },
        ],
      },
      paginationParams: { sort: 'address', order: 'asc' },
    })
    expect(result.data.map(item => item.dao)).to.deep.equal(v2.data)
    expect(result.data[0].account).to.deep.equal({ type: 'dao', network, address: created.address })

    const second = await WorkspaceController.getSuggestions(wallet, { page: 2, pageSize: 2 })
    expect(second.data.map(item => [item.account.address, item.role])).to.deep.equal([[member.address, 'member']])
    const outside = await WorkspaceController.getSuggestions(wallet, { page: 9, pageSize: 2 })
    expect(outside).to.deep.equal({ data: [], metadata: { page: 9, pageSize: 2, totalPages: 2, totalRecords: 3 } })
  })

  it('includes Sepolia DAOs but leaves out other testnet DAOs for creators and members', async () => {
    const sepolia = NetworksEnum.ethereumSepolia
    const baseSepolia = NetworksEnum.baseSepolia
    const mainnetDao = await dao(151, wallet)
    const sepoliaCreator = await dao(152, wallet, {}, sepolia)
    const sepoliaMember = await dao(153, other, {}, sepolia)
    await dao(154, wallet, {}, baseSepolia)
    const baseMember = await dao(155, other, {}, baseSepolia)
    for (const [memberDao, pluginId] of [
      [sepoliaMember, 253],
      [baseMember, 254],
    ] as const) {
      await plugin(pluginId, memberDao.address, IPluginInterfaceType.multisig, { network: memberDao.network })
      await Models.PluginMember.create({
        memberAddress: wallet,
        pluginAddress: address(pluginId),
        daoAddress: memberDao.address,
        network: memberDao.network,
      })
    }

    const result = await WorkspaceController.getSuggestions(wallet, {})

    expect(result.data.map(item => [item.account.network, item.account.address, item.role])).to.deep.equal([
      [network, mainnetDao.address, 'creator'],
      [sepolia, sepoliaCreator.address, 'creator'],
      [sepolia, sepoliaMember.address, 'member'],
    ])
    expect(result.metadata.totalRecords).to.equal(3)
  })

  it('keeps network and address pairs together', async () => {
    const sameAddress = address(301)
    await dao(301, wallet, {}, polygon)
    await dao(301, other)
    await dao(302, wallet)
    const result = await WorkspaceController.getSuggestions(wallet, {})
    expect(result.data.map(item => [item.account.network, item.account.address])).to.deep.equal([
      [network, address(302)],
      [polygon, sameAddress],
    ])
  })

  it('uses active token and VE membership, and includes Safe bodies and processes', async () => {
    const tokenDao = await dao(401)
    const zeroDao = await dao(402)
    const openDao = await dao(403)
    const closedDao = await dao(404)
    const bodyDao = await dao(405)
    const processDao = await dao(406)
    for (const [n, daoAddress, tokenAddress] of [
      [501, tokenDao.address, address(601)],
      [502, zeroDao.address, address(602)],
      [503, openDao.address, address(603)],
      [504, closedDao.address, address(604)],
    ] as const)
      await plugin(n, daoAddress, IPluginInterfaceType.tokenVoting, { tokenAddress })
    await Models.TokenMember.create({ memberAddress: wallet, tokenAddress: address(601), network, votingPower: '1' })
    await Models.TokenMember.create({ memberAddress: wallet, tokenAddress: address(602), network, votingPower: '0' })
    for (const [n, tokenAddress, lockWithdraw] of [
      [1, address(603), {}],
      [2, address(604), { status: true }],
    ] as const)
      await Models.Lock.create({
        network,
        escrowAddress: address(700),
        transactionHash: address(710 + n),
        transactionIndex: 0,
        logIndex: 0,
        memberAddress: wallet,
        nftAddress: address(701),
        tokenAddress,
        exitQueueAddress: address(702),
        tokenId: String(n),
        delegateReceiverAddress: wallet,
        lockWithdraw,
      })
    const safeBody = address(801)
    const safeProcess = address(802)
    await plugin(803, bodyDao.address, IPluginInterfaceType.spp)
    await Models.Setting.create({
      network,
      daoAddress: bodyDao.address,
      pluginAddress: address(803),
      transactionHash: address(804),
      blockNumber: 1,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: safeBody, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    await plugin(802, processDao.address, IPluginInterfaceType.safe)
    await Models.SafeMember.create({ network, safeAddress: safeBody, memberAddress: wallet })
    await Models.SafeMember.create({ network, safeAddress: safeProcess, memberAddress: wallet })

    const result = await WorkspaceController.getSuggestions(wallet, {})
    expect(result.data.map(item => item.account.address)).to.deep.equal([
      tokenDao.address,
      openDao.address,
      bodyDao.address,
      processDao.address,
    ])
  })

  it('returns an empty result when the wallet has no DAOs', async () => {
    await dao(901)
    const result = await WorkspaceController.getSuggestions(wallet, {})
    expect(result).to.deep.equal({ data: [], metadata: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 0 } })
    expect(await WorkspaceController.getSuggestions(wallet, { page: 9, pageSize: 2 })).to.deep.equal({
      data: [],
      metadata: { page: 1, pageSize: 2, totalPages: 1, totalRecords: 0 },
    })
  })
})
