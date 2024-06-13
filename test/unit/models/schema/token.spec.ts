import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'

describe('Model: Token', () => {
  let sandbox: SinonSandbox
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      network: NetworksEnum.mainnet,
      type: ITokenType.ERC20,
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      logo: 'fake-logo',
      name: 'ethereum',
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: '100',
      priceChangeOnDayUsd: '1',
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().toDate() as any,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Token', async () => {
    const createdToken = await Models.Token.create(rawToken)

    expect(createdToken.id).to.exist
    expect(createdToken.address).to.eq(rawToken.address)
    expect(createdToken.network).to.eq(rawToken.network)
    expect(createdToken.type).to.eq(rawToken.type)
    expect(createdToken.logo).to.eq(rawToken.logo)
    expect(createdToken.name).to.eq(rawToken.name)
    expect(createdToken.symbol).to.eq(rawToken.symbol)
    expect(createdToken.decimals).to.eq(rawToken.decimals)
    expect(createdToken.holders).to.eq(rawToken.holders)
    expect(createdToken.totalSupply).to.eq(rawToken.totalSupply)
    expect(createdToken.priceChangeOnDayUsd).to.eq(rawToken.priceChangeOnDayUsd)
    expect(createdToken.priceUsd).to.eq(rawToken.priceUsd)
    expect(createdToken.lastUpdatedAt.toString()).to.eq(rawToken?.lastUpdatedAt!.toString())
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.mainnet
    const entityId = await Models.Token.getEntityId(address, network)
    expect(entityId).to.eq(`${address}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Token.create(rawToken)
    const foundLogDao = await Models.Token.findExistingLog(createdLogDao.address, createdLogDao.network)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Token.create(rawToken)
    const foundLogDao = await Models.Token.findByEntityId(createdLogDao.entityId)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should update Token', async () => {
    const createdToken = await Models.Token.create(rawToken)
    expect(createdToken.address).to.eq(rawToken.address)

    await createdToken.update({
      address: '0x162433c934aA74ba147E05150B1206b2C922f71d',
    })

    expect(createdToken.address).to.eq('0x162433c934aA74ba147E05150B1206b2C922f71d')
  })

  it('Should find Token by address', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const token = await Models.Token.findByTokenAddress(createdToken.address)
    expect(token?.address).to.eq(createdToken.address)
  })

  it('Should find Token by address and networks', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const token = await Models.Token.findByTokenAddressAndNetwork(
      createdToken.address,
      rawToken.network as NetworksEnum,
    )
    expect(token?.address).to.eq(createdToken.address)
  })

  it('Should reload', async () => {
    const createdToken = await Models.Token.create(rawToken)
    await createdToken.reload()

    expect(createdToken.address).to.eq(rawToken.address)
  })

  it('Should filterKeys', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const filterToken = createdToken.filterKeys()

    expect(filterToken.id).to.be.undefined
    expect(filterToken._id).to.be.undefined
    expect(filterToken.__v).to.be.undefined
    expect(filterToken.createdAt).to.be.undefined
    expect(filterToken.updatedAt).to.be.undefined
    expect(Object.keys(filterToken).length).to.eq(14)
  })
})
