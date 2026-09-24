import { Models } from '@dbModels'
import SafeRelationsModule from '@modules/safe/safeRelations'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A' as HexAddress
const OTHER_BRAND_SAFE = getAddress('0x000000000000000000000000000000000000beef') as HexAddress
const OWNER = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
const DAO_A = '0x665928FeacC8739116A3f2eF66a9c61936348DC2' as HexAddress
const DAO_B = '0x00000000000000000000000000000000000000B0' as HexAddress
const SPP_A = '0x000000000000000000000000000000000000a001'
const SPP_B = '0x000000000000000000000000000000000000B001'

const seedBody = async (
  daoAddress: string,
  sppAddress: string,
  bodies: Array<{ address: string; brandId?: VotingBodyBrandIdentity }>,
) => {
  await Models.Dao.create({
    address: daoAddress,
    network: NETWORK,
    creatorAddress: OWNER,
    transactionHash: `0x${daoAddress.slice(2).padEnd(64, '0')}`,
    blockNumber: 1,
    isActive: true,
  })
  await Models.Plugin.create({
    address: sppAddress,
    daoAddress,
    network: NETWORK,
    transactionHash: `0x${sppAddress.slice(2).padEnd(64, '0')}`,
    blockNumber: 1,
    interfaceType: IPluginInterfaceType.spp,
    status: IPluginStatus.installed,
    isSupported: true,
  })
  await Models.Setting.create({
    transactionHash: `0x${sppAddress.slice(2).padEnd(64, '1')}`,
    blockNumber: 1,
    network: NETWORK,
    status: ISettingStatus.active,
    daoAddress,
    pluginAddress: sppAddress,
    stages: [
      {
        stageIndex: 0,
        plugins: bodies.map(({ address, brandId = VotingBodyBrandIdentity.SAFE }) => ({ address, brandId })),
      },
    ],
  })
}

const seedProcess = async (daoAddress: string, safeAddress: string, status = IPluginStatus.installed) =>
  Models.Plugin.create({
    address: safeAddress,
    daoAddress,
    network: NETWORK,
    transactionHash: `0x${safeAddress.slice(2).padEnd(64, '0')}`,
    blockNumber: 1,
    interfaceType: IPluginInterfaceType.safe,
    status,
    isSupported: true,
    isProcess: true,
  })

describe('Module: SafeRelations', () => {
  beforeEach(async () => {
    await seedBody(DAO_A, SPP_A, [{ address: SAFE }, { address: SAFE }])
    await seedBody(DAO_B, SPP_B, [{ address: SAFE }])
  })

  it('finds every DAO a Safe body reaches without crossing SAFE brand bodies', async () => {
    const dao = '0x000000000000000000000000000000000000c001' as HexAddress
    await seedBody(dao, '0x000000000000000000000000000000000000c002', [
      { address: OTHER_BRAND_SAFE, brandId: VotingBodyBrandIdentity.OTHER },
      { address: SAFE, brandId: VotingBodyBrandIdentity.SAFE },
    ])

    const daos = await SafeRelationsModule.findDaos([SAFE, OTHER_BRAND_SAFE], NETWORK)
    expect(daos.map(({ daoAddress }) => daoAddress)).to.have.members([DAO_A, DAO_B, dao])

    expect(await SafeRelationsModule.findDaos([OTHER_BRAND_SAFE], NETWORK)).to.deep.equal([])
    expect(await SafeRelationsModule.findDaos([], NETWORK)).to.deep.equal([])
  })

  it('gives one relation per (dao, safe) pair when a Safe is both a body and a process of the same DAO', async () => {
    await seedProcess(DAO_A, SAFE)

    const relations = await SafeRelationsModule.resolve({ network: NETWORK, safeAddresses: [SAFE] })

    expect(relations).to.have.deep.members([
      { network: NETWORK, daoAddress: DAO_A, safeAddress: SAFE },
      { network: NETWORK, daoAddress: DAO_B, safeAddress: SAFE },
    ])
    expect(await SafeRelationsModule.getSafeAddresses(DAO_A, NETWORK)).to.deep.equal([SAFE])
  })

  it('sees a Safe that reaches the DAO as a process and forgets it once execute is revoked', async () => {
    const dao = '0x000000000000000000000000000000000000d001' as HexAddress
    const processSafe = '0x000000000000000000000000000000000000d002' as HexAddress
    const revoked = '0x000000000000000000000000000000000000d004' as HexAddress
    await seedProcess(dao, processSafe)
    await seedProcess(dao, revoked, IPluginStatus.uninstalled)

    expect(await SafeRelationsModule.getSafeAddresses(dao, NETWORK)).to.deep.equal([processSafe])
    expect((await SafeRelationsModule.findDaos([processSafe], NETWORK)).map(r => r.daoAddress)).to.deep.equal([dao])
    expect(await SafeRelationsModule.isTracked(NETWORK, processSafe)).to.equal(true)
    expect(await SafeRelationsModule.isTracked(NETWORK, revoked)).to.equal(false)
  })

  it('stops tracking a body once its SPP plugin is uninstalled', async () => {
    expect(await SafeRelationsModule.isTracked(NETWORK, SAFE)).to.equal(true)

    await Models.Plugin.updateMany(
      { network: NETWORK, address: { $in: [SPP_A, SPP_B] } },
      { status: IPluginStatus.uninstalled },
    )

    expect(await SafeRelationsModule.isTracked(NETWORK, SAFE)).to.equal(false)
    expect(await SafeRelationsModule.getSafeAddresses(DAO_A, NETWORK)).to.deep.equal([])
  })
})
