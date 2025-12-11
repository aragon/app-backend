import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import utils from '@helpers/utils'

describe('Model: Token', () => {
  let sandbox: SinonSandbox
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      logo: 'fake-logo',
      name: NetworksEnum.ethereumMainnet,
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: '100',
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
    expect(createdToken.priceUsd).to.eq(rawToken.priceUsd)
    expect(createdToken.skipFetchRate).to.eq(false)
    expect(createdToken.lastUpdatedAt.toString()).to.eq(rawToken?.lastUpdatedAt!.toString())
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Token.getEntityId({ address, network })
    expect(entityId).to.eq(`${address}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Token.create(rawToken)
    const foundLogDao = await Models.Token.findExistingLog({
      address: createdLogDao.address,
      network: createdLogDao.network,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Token.create(rawToken)
    const foundLogDao = await Models.Token.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should update Token', async () => {
    const createdToken = await Models.Token.create(rawToken)
    expect(createdToken.address).to.eq(rawToken.address)

    await createdToken.update({
      address: '0x162433c934aA74ba147E05150B1206b2C922f71d',
    })

    expect(createdToken.address).to.eq('0x162433c934aA74ba147E05150B1206b2C922f71d')
  })

  it('Should not update required field with falsy value', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const originalNetwork = createdToken.network

    // Try to update required field with null - should not update
    await createdToken.update({
      network: null as any,
    })

    expect(createdToken.network).to.eq(originalNetwork)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdToken = await Models.Token.create(rawToken)

    // Try to update with non-existent field
    await createdToken.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(createdToken).to.exist
  })

  it('Should find Token by address and networks', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const token = await Models.Token.findByTokenAddressAndNetwork(
      createdToken.address,
      rawToken.network as NetworksEnum,
    )
    expect(token?.address).to.eq(createdToken.address)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeTokens = [
        {
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.ERC20,
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          logo: 'fake-logo',
          name: NetworksEnum.ethereumMainnet,
          symbol: 'WETH',
          decimals: 18,
          holders: 10,
          totalSupply: '100',
          priceUsd: '1',
          lastUpdatedAt: dayjs.utc().toDate() as any,
        },
        {
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.native,
          address: utils.zeroAddress,
          logo: 'fake-logo',
          name: NetworksEnum.ethereumMainnet,
          symbol: 'ETH',
          decimals: 18,
          holders: 10,
          totalSupply: '0',
          priceUsd: '1',
          lastUpdatedAt: dayjs.utc().toDate() as any,
        },
      ]

      await Promise.all(fakeTokens.map(w => Models.Token.create(w)))
    })

    it('Should find Pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Token.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find Pagination with type', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Token.findWithPagination({
        extraParams: {
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.native,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should not found documents', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Token.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(0)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
    })
  })

  it('Should reload', async () => {
    const createdToken = await Models.Token.create(rawToken)
    await createdToken.reload()

    expect(createdToken.address).to.eq(rawToken.address)
  })

  it('Should filterKeys', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const filterToken = createdToken.filterKeys()

    expect(filterToken.id).to.exist
    expect(filterToken._id).to.be.undefined
    expect(filterToken.__v).to.be.undefined
    expect(filterToken.createdAt).to.be.undefined
    expect(filterToken.updatedAt).to.be.undefined
    expect(Object.keys(filterToken).length).to.eq(27)
  })

  it('should get holder count', async () => {
    const createdToken = await Models.Token.create(rawToken)

    // Create TokenMembers with voting power
    await Models.TokenMember.create({
      memberAddress: '0x123456789012345678901234567890123456789A',
      tokenAddress: createdToken.address,
      network: createdToken.network,
      votingPower: '1000000',
      delegateReceivedCount: 0,
    })

    await Models.TokenMember.create({
      memberAddress: '0x223456789012345678901234567890123456789A',
      tokenAddress: createdToken.address,
      network: createdToken.network,
      votingPower: '500000',
      delegateReceivedCount: 0,
    })

    // One with zero voting power (should not count)
    await Models.TokenMember.create({
      memberAddress: '0x323456789012345678901234567890123456789A',
      tokenAddress: createdToken.address,
      network: createdToken.network,
      votingPower: '0',
      delegateReceivedCount: 0,
    })

    const holderCount = await createdToken.countHolders()
    expect(holderCount).to.eq(2)
  })

  it('should pick fields', async () => {
    const createdToken = await Models.Token.create(rawToken)
    const picked = createdToken.pickFields(['address', 'network'])
    expect(picked).to.deep.equal({
      address: createdToken.address,
      network: createdToken.network,
    })
  })
})
