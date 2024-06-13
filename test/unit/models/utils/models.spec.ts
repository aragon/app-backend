import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ModelUtils, { utcDateProp } from '@models/utils/models'
import dayjs from '@helpers/dayjs'
import { getModelForClass } from '@typegoose/typegoose'

describe('Model/Utils: models', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('parseParams', function () {
    it('should generate search query with regex', function () {
      const opts = { search: 'test' }
      const searchBy = ['name', 'description']
      const result = ModelUtils.parseParams(opts, searchBy)

      expect(result.$or).to.be.an('array').that.has.lengthOf(searchBy.length)
      searchBy.forEach(prop => {
        const condition = result.$or.find(c => c.hasOwnProperty(prop))
        expect(condition).to.not.be.undefined
        expect(condition[prop]).to.deep.equal({
          $regex: '^test',
          $options: 'i',
        })
      })
    })

    it('should generate date range query for createdAt', function () {
      const fromDate = '2021-01-01'
      const toDate = '2021-01-31'
      const opts = { fromDate, toDate }
      const result = ModelUtils.parseParams(opts)

      expect(dayjs(result.createdAt.$gte).toISOString()).to.equal(dayjs.utc(fromDate).startOf('day').toISOString())
      expect(dayjs(result.createdAt.$lte).toISOString()).to.equal(dayjs.utc(toDate).endOf('day').toISOString())
    })

    it('should generate date range query for createdAt with toDate only', function () {
      const toDate = '2021-01-31'
      const opts = { toDate }
      const result = ModelUtils.parseParams(opts)

      expect(dayjs(result.createdAt.$lte).toISOString()).to.equal(dayjs.utc(toDate).endOf('day').toISOString())
    })

    it('should generate date range query for createdAt with fromDate only', function () {
      const fromDate = '2021-01-01'
      const opts = { fromDate }
      const result = ModelUtils.parseParams(opts)

      expect(dayjs(result.createdAt.$gte).toISOString()).to.equal(dayjs.utc(fromDate).startOf('day').toISOString())
    })
  })

  describe('requestPaginate', function () {
    it('should generate pagination and sorting query', function () {
      const opts = { limit: '10', skip: '2', orderProp: 'name', order: 'asc' }
      const result = ModelUtils.requestPaginate(opts as any)

      expect(result).to.deep.equal({
        limit: 10,
        skip: 10, // (10 * (2 - 1))
        sort: { name: 1 },
      })
    })

    it('defaults to specified values when options are missing', function () {
      const opts = {}
      const result = ModelUtils.requestPaginate(opts)

      expect(result.limit).to.equal(10)
      expect(result.skip).to.equal(0)
      expect(result.sort).to.deep.equal({ createdAt: -1 })
    })

    it('result limit should be zero when request limit is zero', function () {
      const opts = { limit: 0 }
      const result = ModelUtils.requestPaginate(opts as any)

      expect(result.limit).to.equal(0)
    })

    it('result skip should be zero when request skip is zero', function () {
      const opts = { skip: 0 }
      const result = ModelUtils.requestPaginate(opts as any)

      expect(result.skip).to.equal(0)
    })
  })

  it('should return null when setting a null value', async function () {
    class MockModel {
      @utcDateProp()
      public date?: Date
    }

    const MockModelClass = getModelForClass(MockModel)

    const instance: any = new MockModelClass()
    instance.date = null
    expect(instance.date).to.equal(null)
  })
})
