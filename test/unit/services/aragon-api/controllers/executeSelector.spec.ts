import { Models } from '@dbModels'
import SelectorPermission from '@models/schema/selectorPermission'
import ExecuteSelectorController from '@services/aragon-api/controllers/executeSelector'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: ExecuteSelector', () => {
  let sandbox: SinonSandbox
  let rawSelectorPermission: Partial<SelectorPermission>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawSelectorPermission = {
      id: 'test-id-1',
      transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 12345,
      blockTimestamp: 1634567890,
      network: NetworksEnum.ethereumSepolia,
      pluginAddress: '0xplugin123456789012345678901234567890123456',
      daoAddress: '0xdao1234567890123456789012345678901234567890',
      conditionAddress: '0xcondition12345678901234567890123456789012',
      selector: '0xa9059cbb',
      target: '0xtarget123456789012345678901234567890123456',
      isAllowed: true,
      disallowed: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
    }

    await Models.SelectorPermission.create(rawSelectorPermission)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getExecuteSelectorsWithPagination', () => {
    it('should get execute selectors with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'blockNumber',
      }

      const filterParams: any = {
        network: rawSelectorPermission.network,
        pluginAddress: rawSelectorPermission.pluginAddress,
        daoAddress: rawSelectorPermission.daoAddress,
        conditionAddress: rawSelectorPermission.conditionAddress,
      }

      const spyReq = sandbox.spy(Models.SelectorPermission, 'findWithPagination')

      const response = await ExecuteSelectorController.getExecuteSelectorsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'blockNumber',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawSelectorPermission.network)
      expect(response.data[0].pluginAddress).to.eq(rawSelectorPermission.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawSelectorPermission.daoAddress)
      expect(response.data[0].conditionAddress).to.eq(rawSelectorPermission.conditionAddress)
      expect(response.data[0].selector).to.eq(rawSelectorPermission.selector)
      expect(response.data[0].target).to.eq(rawSelectorPermission.target)
      expect(response.data[0].isAllowed).to.eq(rawSelectorPermission.isAllowed)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get execute selectors - minimal params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'blockNumber',
      }

      const filterParams: any = {
        network: rawSelectorPermission.network,
        pluginAddress: rawSelectorPermission.pluginAddress,
      }

      const spyReq = sandbox.spy(Models.SelectorPermission, 'findWithPagination')

      const response = await ExecuteSelectorController.getExecuteSelectorsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'blockNumber',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawSelectorPermission.network)
      expect(response.data[0].pluginAddress).to.eq(rawSelectorPermission.pluginAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should return empty response if filter params do not match', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'blockNumber',
      }

      const filterParams: any = {
        network: rawSelectorPermission.network,
        pluginAddress: '0xinvalidplugin1234567890123456789012345678',
      }

      const spyReq = sandbox.spy(Models.SelectorPermission, 'findWithPagination')

      const response = await ExecuteSelectorController.getExecuteSelectorsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true

      expect(response).to.have.property('data').with.lengthOf(0)
    })

    it('should call getExecuteSelectorsWithPagination with no arguments (default parameters)', async () => {
      const spyReq = sandbox.spy(Models.SelectorPermission, 'findWithPagination')

      const response = await ExecuteSelectorController.getExecuteSelectorsWithPagination({}, {} as any)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {},
          paginationParams: {},
        }),
      ).to.be.true

      expect(response).to.have.property('data')
    })

    it('should handle when findWithPagination returns empty results', async () => {
      sandbox.stub(Models.SelectorPermission, 'findWithPagination').resolves({
        data: [],
        metadata: {
          page: 1,
          totalPages: 0,
          totalRecords: 0,
          pageSize: 10,
        },
      })

      const response = await ExecuteSelectorController.getExecuteSelectorsWithPagination({}, {} as any)

      expect(response).to.have.property('data').with.lengthOf(0)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(0)
      expect(response.metadata.totalRecords).to.eq(0)
    })
  })
})
