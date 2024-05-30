import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { HexAddress, NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import Asset from '@models/schema/asset'

describe('Model: Asset', () => {
  let sandbox: SinonSandbox
  let rawAsset: Partial<Asset>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawAsset = {
      network: ethereumNetwork.name,
      daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
      amount: '32423423',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Asset', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)

    expect(createdAsset.id).to.exist
    expect(createdAsset.network).to.eq(rawAsset.network)
    expect(createdAsset.daoAddress).to.eq(rawAsset.daoAddress)
    expect(createdAsset.tokenAddress).to.eq(rawAsset.tokenAddress)
    expect(createdAsset.amount).to.eq(rawAsset.amount)
  })

  it('Should getEntityId', async () => {
    const daoAddress = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const tokenAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const network = NetworksEnum.mainnet
    const entityId = await Models.Asset.getEntityId(daoAddress, tokenAddress, network)
    expect(entityId).to.eq(`${daoAddress}-${tokenAddress}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Asset.create(rawAsset)
    const foundLogDao = await Models.Asset.findExistingLog(
      createdLogDao.daoAddress,
      createdLogDao.tokenAddress,
      createdLogDao.network,
    )
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Asset.create(rawAsset)
    const foundLogDao = await Models.Asset.findByEntityId(createdLogDao.entityId)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should update Asset', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    expect(createdAsset.amount).to.eq(rawAsset.amount)

    await createdAsset.update({
      amount: '90',
    })

    expect(createdAsset.amount).to.eq('90')
  })

  it('Should findAssetsByDao', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    const assets = await Models.Asset.findAssetsByDao(
      rawAsset.daoAddress as HexAddress,
      rawAsset.network as NetworksEnum,
    )
    expect(assets[0].tokenAddress).to.eq(createdAsset.tokenAddress)
  })

  it('Should findAssetByTokenAndDao', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    const token = await Models.Asset.findAssetByTokenAndDao(
      createdAsset.tokenAddress,
      createdAsset.daoAddress,
      rawAsset.network as NetworksEnum,
    )
    expect(token?.tokenAddress).to.eq(createdAsset.tokenAddress)
  })

  it('Should reload', async () => {
    const createdAsset = await Models.Asset.create(rawAsset)
    await createdAsset.reload()

    expect(createdAsset.tokenAddress).to.eq(rawAsset.tokenAddress)
  })
})
