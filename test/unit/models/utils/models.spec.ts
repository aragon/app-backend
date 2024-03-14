import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ModelUtils from '@models/utils/models'
import dayjs from '@helpers/dayjs'

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

      expect(dayjs(result.createdAt.$gte).toISOString()).to.equal(
        dayjs.utc(fromDate).startOf('day').toISOString(),
      )
      expect(dayjs(result.createdAt.$lte).toISOString()).to.equal(
        dayjs.utc(toDate).endOf('day').toISOString(),
      )
    })
  })

  describe('requestPaginate', function () {
    it('should generate pagination and sorting query', function () {
      const opts = { limit: '10', offset: '2', orderProp: 'name', order: 'asc' }
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

      expect(result.limit).to.equal(15)
      expect(result.skip).to.equal(0) // (15 * (1 - 1))
      expect(result.sort).to.deep.equal({ createdAt: -1 })
    })
  })
})
