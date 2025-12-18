import dayjs from '@helpers/dayjs'
import ModelUtils, { utcDateProp } from '@models/utils/models'
import { getModelForClass } from '@typegoose/typegoose'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model/Utils: models', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('paginateAndSort', () => {
    it('should apply default pagination and sorting if no parameters are provided', () => {
      const result = ModelUtils.paginateAndSort({})
      expect(result).to.deep.equal({
        limit: 10,
        skip: 0,
        sort: { createdAt: -1, id: -1 },
      })
    })

    it('should correctly calculate pagination and apply sorting based on input', () => {
      const params = { pageSize: 20, page: 2, sort: 'date', order: 'asc' }
      const result = ModelUtils.paginateAndSort(params)
      expect(result).to.deep.equal({
        limit: 20,
        skip: 20,
        sort: { date: 1, id: 1 },
      })
    })
  })

  describe('createFilter', () => {
    it('should create a filter with search terms and date range', () => {
      const params = {
        search: 'test',
        startDate: 1719577224,
        endDate: 2019577224,
      }
      const searchFields = ['name', 'description']
      const result = ModelUtils.createFilter(params, searchFields)

      expect(result).to.include.keys(['$or', 'startDate', 'endDate'])
      expect(result.startDate).to.deep.include({
        $gte: 1719577224,
      })
      expect(result.endDate).to.deep.include({
        $lte: 2019577224,
      })
    })

    it('should create a filter with search terms and date range with same params', () => {
      const params = {
        search: 'test',
        startDateProp: 'blockNumber',
        endDateProp: 'blockNumber',
        startDate: 1719577224,
        endDate: 2019577224,
      }
      const searchFields = ['name', 'description']
      const result = ModelUtils.createFilter(params, searchFields)

      expect(result).to.include.keys(['$or', 'blockNumber'])
      expect(result.blockNumber).to.deep.include({
        $gte: 1719577224,
        $lte: 2019577224,
      })
    })
  })

  describe('parsePaginationParams', () => {
    it('should extract pagination parameters from RouterContext with default sort and order', () => {
      const ctx = {
        query: {
          pageSize: '15',
          page: '3',
        },
      }
      const result = ModelUtils.parsePaginationParams(ctx as any)

      expect(result).to.deep.equal({
        search: undefined,
        startDateProp: undefined,
        endDateProp: undefined,
        startDate: undefined,
        endDate: undefined,
        pageSize: 15,
        page: 3,
        order: 'desc',
        sort: 'startDate',
      })
    })

    it('should return a checksummed Ethereum address if a valid lowercase address is provided', () => {
      const validLowercaseAddress = '0x837f0dcf97125bc9586af49bb4a727e009d0f5f3'
      const ctx = {
        query: {
          search: validLowercaseAddress,
        },
      }
      const result = ModelUtils.parsePaginationParams(ctx as any)
      const checksumAddress = getAddress(validLowercaseAddress)
      expect(result.search).to.equal(checksumAddress)
    })

    it('should retain the original search value if Ethereum address parsing fails', () => {
      const invalidAddress = '0x123'
      const ctx = {
        query: {
          search: invalidAddress,
        },
      }
      const result = ModelUtils.parsePaginationParams(ctx as any)
      expect(result.search).to.equal(invalidAddress)
    })
  })

  describe('paginateEmptyResponse', () => {
    it('should return a standardized empty pagination response', () => {
      const result = ModelUtils.paginateEmptyResponse(10)
      expect(result).to.deep.equal({
        metadata: {
          page: 1,
          pageSize: 10,
          totalRecords: 0,
          totalPages: 1,
        },
        data: [],
      })
    })
  })

  describe('utcDateProp', () => {
    it('should handle null values correctly', () => {
      class MockModel {
        @utcDateProp()
        public date?: Date
      }

      const MockModelClass = getModelForClass(MockModel) // Mock the creation

      const instance = new MockModelClass()
      instance.date = null as any
      expect(instance.date).to.be.null
    })

    it('should convert input to UTC date', () => {
      class MockModel {
        @utcDateProp()
        public date?: Date
      }

      const MockModelClass = getModelForClass(MockModel) // Mock the creation

      const instance = new MockModelClass()
      const testDate = new Date('2022-01-01T12:00:00Z')
      instance.date = testDate
      expect(instance.date).to.deep.equal(dayjs.utc(testDate).toDate())
    })
  })
})
