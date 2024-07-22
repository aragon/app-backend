import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DelegateController from '@services/aragon-api/controllers/delegate'
import { ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Delegate from '@models/schema/delegate'
import PairDataModule from '@modules/pairData'

describe('Controller: Delegate', () => {
  let sandbox: SinonSandbox
  let rawDelegate: Partial<Delegate>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawDelegate = {
      transactionHash: '0x23cb0c69d2047aa825de386100e8c4509ac66b6b0b7afa1b54ec22b26cab875b',
      blockNumber: 48130742,
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

    await Models.Delegate.create(rawDelegate)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDelegateWithPagination', () => {
    it('should get delegate with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        memberAddress: rawDelegate.fromDelegate,
        pluginAddress: rawDelegate.pluginAddress,
        daoAddress: rawDelegate.daoAddress,
        tokenAddress: rawDelegate.tokenAddress,
      }

      const spyReq = sandbox.spy(Models.Delegate, 'findWithPagination')

      const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawDelegate.network)
      expect(response.data[0].blockNumber).to.eq(rawDelegate.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawDelegate.transactionHash)
      expect(response.data[0].fromDelegate).to.eq(rawDelegate.fromDelegate)
      expect(response.data[0].toDelegate).to.eq(rawDelegate.toDelegate)
      expect(response.data[0].tokenAddress).to.eq(rawDelegate.tokenAddress)
      expect(response.data[0].pluginAddress).to.eq(rawDelegate.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawDelegate.daoAddress)
      expect(response.data[0].tokenAddress).to.eq(rawDelegate.tokenAddress)
      expect(response.data[0].amount).to.eq(rawDelegate.amount)
      expect(response.data[0].token.type).to.eq(rawDelegate.token?.type)
      expect(response.data[0].token.address).to.eq(rawDelegate.token?.address)
      expect(response.data[0].token.decimals).to.eq(rawDelegate.token?.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get delegate no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Delegate, 'findWithPagination')

      const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawDelegate.network)
      expect(response.data[0].blockNumber).to.eq(rawDelegate.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawDelegate.transactionHash)
      expect(response.data[0].fromDelegate).to.eq(rawDelegate.fromDelegate)
      expect(response.data[0].toDelegate).to.eq(rawDelegate.toDelegate)
      expect(response.data[0].tokenAddress).to.eq(rawDelegate.tokenAddress)
      expect(response.data[0].pluginAddress).to.eq(rawDelegate.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawDelegate.daoAddress)
      expect(response.data[0].tokenAddress).to.eq(rawDelegate.tokenAddress)
      expect(response.data[0].amount).to.eq(rawDelegate.amount)
      expect(response.data[0].token.type).to.eq(rawDelegate.token?.type)
      expect(response.data[0].token.address).to.eq(rawDelegate.token?.address)
      expect(response.data[0].token.decimals).to.eq(rawDelegate.token?.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get delegate with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawDelegate.network}-${rawDelegate.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawDelegate.daoAddress,
        network: rawDelegate.network,
      })
      const spyReq = sandbox.spy(Models.Delegate, 'findWithPagination')

      const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawDelegate.daoAddress,
            network: rawDelegate.network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawDelegate.network)
      expect(response.data[0].daoAddress).to.eq(rawDelegate.daoAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get delegate with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawDelegate.network}-${rawDelegate.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      const spyReq = sandbox.spy(Models.Delegate, 'findWithPagination')

      const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })
})
