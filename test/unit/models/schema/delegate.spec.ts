import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ITokenType, NetworksEnum } from '@types'
import Delegate from '@models/schema/delegate'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import ModelUtils from '@models/utils/models'

describe('Model: Delegate', () => {
  let sandbox: SinonSandbox
  let rawDelegate: Partial<Delegate>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDelegate = {
      transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875b',
      blockNumber: 48130742,
      blockTimestamp: 1219577223,
      network: NetworksEnum.polygonMainnet,
      tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
      fromDelegate: '0x0000000000000000000000000000000000000000',
      toDelegate: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4',
      pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e4',
      daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AED',
      amount: '101192000000000000',
      token: {
        network: NetworksEnum.polygonMainnet,
        type: ITokenType.GovernanceERC20,
        address: '0x5B08305497fb3a087Fc582D45fcb648c98177c43',
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x5b08305497fb3a087fc582d45fcb648c98177c43.png',
        name: 'Sepolia Avalanche',
        decimals: 18,
        symbol: 'SAVL',
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Delegate', async () => {
    it('Should create Delegate', async () => {
      const entityId = Models.Delegate.getEntityId({
        network: rawDelegate.network!,
        transactionHash: rawDelegate.transactionHash!,
      })
      const member = await Models.Delegate.create(rawDelegate)
      expect(member.id).to.eq(entityId)
    })

    it('should update Delegate', async () => {
      const member = await Models.Delegate.create(rawDelegate)
      const updatedMember = await member.update({ tokenAddress: '0x00' })
      expect(updatedMember.tokenAddress).to.eq('0x00')
    })

    it('Should getEntityId', async () => {
      const entityId = Models.Delegate.getEntityId({
        network: rawDelegate.network!,
        transactionHash: rawDelegate.transactionHash!,
      })
      expect(entityId).to.eq(`${rawDelegate.network}-${rawDelegate.transactionHash}`)
    })

    it('Should findExistingLog', async () => {
      const createdMember = await Models.Delegate.create(rawDelegate)
      const foundMember = await Models.Delegate.findExistingLog({
        network: rawDelegate.network!,
        transactionHash: rawDelegate.transactionHash!,
      })
      expect(foundMember?.id).to.eq(createdMember.id)
    })

    it('should reload Delegate', async () => {
      const createdMember = await Models.Delegate.create(rawDelegate)
      const foundMember = await createdMember.reload()
      expect(foundMember?.id).to.eq(createdMember.id)
    })
  })

  it('Should getEntityId', async () => {
    const network = NetworksEnum.ethereumMainnet
    const transactionHash = '0xxxx'
    const entityId = Models.Delegate.getEntityId({ network, transactionHash })
    expect(entityId).to.eq(`${network}-${transactionHash}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Delegate.create(rawDelegate)
    const foundLogDao = await Models.Delegate.findExistingLog({
      network: createdLogDao.network!,
      transactionHash: createdLogDao.transactionHash!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Delegate.create(rawDelegate)
    const foundLogDao = await Models.Delegate.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const delegates = [
        {
          transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875b',
          blockTimestamp: 1219577223,
          blockNumber: 48130742,
          network: NetworksEnum.polygonMainnet,
          tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
          fromDelegate: '0x0000000000000000000000000000000000000000',
          toDelegate: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4',
          pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e2',
          daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AED',
          amount: '101192000000000000',
          token: {
            network: NetworksEnum.polygonMainnet,
            type: ITokenType.GovernanceERC20,
            address: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB98',
            logo: 'https://logos.covalenthq.com/tokens/11155111/0x5b08305497fb3a087fc582d45fcb648c98177c43.png',
            name: 'Sepolia Avalanche',
            decimals: 18,
            symbol: 'SAVL',
          },
        },
        {
          transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875a',
          blockTimestamp: 1219577223,
          blockNumber: 48130740,
          network: NetworksEnum.polygonMainnet,
          tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
          fromDelegate: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4',
          toDelegate: '0x0000000000000000000000000000000000000000',
          pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e4',
          daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AEE',
          amount: '101192000000000000',
          token: {
            network: NetworksEnum.polygonMainnet,
            type: ITokenType.GovernanceERC20,
            address: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB97',
            logo: 'https://logos.covalenthq.com/tokens/11155111/0x5b08305497fb3a087fc582d45fcb648c98177c43.png',
            name: 'Sepolia Avalanche',
            decimals: 18,
            symbol: 'SAVL',
          },
        },
      ]

      await Promise.all(delegates.map(delegate => Models.Delegate.create(delegate)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Delegate.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with all params daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Delegate.findWithPagination({
        extraParams: {
          tokenAddress: '0x9707e0FD480e02Dee8836Cf7878d61D7b630fB99',
          daoAddress: '0x5f39E3c3CcDf02D028C97b9d04365AFDE8432AEE',
          pluginAddress: '0x59Aa10590c99Cd0A3b4c7050c7279A8133a759e4',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with with memberAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Delegate.findWithPagination({
        extraParams: { memberAddress: '0x00004FE6931BFB16820DB9aAAA2467A59f33ffe4' },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Delegate.findWithPagination({
        extraParams: { pluginAddress: '0x0000000000000000000000000000000000000000' },
        paginationParams: {},
      })

      expect(spyUtils.calledOnce).to.be.true
      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Delegate.create(rawDelegate)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawDelegate.address)
  })

  it('Should filterKeys', async () => {
    const createdDao = await Models.Delegate.create(rawDelegate)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.token).to.exist
    expect(filterDao.id).to.be.undefined
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(filterDao.token._id).to.be.undefined
    expect(filterDao.token.id).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(11)
  })
})
