import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ValidationSchema from '@helpers/validationSchema'
import Joi from 'joi'
import { ErrorKeyEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import dayjs from '@helpers/dayjs'

describe('Helpers:ValidationSchema', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Custom schema', () => {
    it('joiUuid', async () => {
      const uuid = '5d5a111b29ab354952b1543d'

      const res = await ValidationSchema.joiUuid.validateAsync(uuid)
      expect(res).to.eq(uuid)

      await expect(ValidationSchema.joiUuid.validateAsync('5d5a111b294952b1543d')).to.be.rejectedWith(
        Error,
        '"value" with value "5d5a111b294952b1543d" fails to match the required pattern: /^[0-9a-fA-F]{24}$/',
      )
    })

    it('joiEmail', async () => {
      const res = await ValidationSchema.joiEmail.validateAsync('cris@me.com')
      expect(res).to.eq('cris@me.com')

      const res1 = await ValidationSchema.joiEmail.validateAsync('cris@me.comee')
      expect(res1).to.eq('cris@me.comee')

      const res2 = await ValidationSchema.joiEmail.validateAsync('cris@me.comeea')
      expect(res2).to.eq('cris@me.comeea')

      const res3 = await ValidationSchema.joiEmail.validateAsync('+cris@me.com')
      expect(res3).to.eq('+cris@me.com')

      const res4 = await ValidationSchema.joiEmail.validateAsync('213te@me.com')
      expect(res4).to.eq('213te@me.com')

      await expect(ValidationSchema.joiEmail.validateAsync('te@me.com213123123')).to.be.rejectedWith(
        Error,
        '"value" with value "te@me.com213123123" fails to match the required pattern: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,6}$/',
      )

      await expect(ValidationSchema.joiEmail.validateAsync('213te@me.comcomo')).to.be.rejectedWith(
        Error,
        '"value" with value "213te@me.comcomo" fails to match the required pattern: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,6}$/',
      )
    })

    it('joiEns', async () => {
      // Case 1: Standard .eth domain
      const ens = 'test.eth'
      const res = await ValidationSchema.joiEns.validateAsync(ens)
      expect(res).to.eq(ens)

      // Case 2: Subdomain with .dao.eth
      const ens2 = 'test.dao.eth'
      const res2 = await ValidationSchema.joiEns.validateAsync(ens2)
      expect(res2).to.eq(ens2)

      // Case 3: Plain name without extension should append .dao.eth
      const plainName = 'aragon'
      const res3 = await ValidationSchema.joiEns.validateAsync(plainName)
      expect(res3).to.eq('aragon.dao.eth')

      // Case 4: Multiple level subdomains should be allowed
      const ens4 = 'test.subdomain.dao.eth'
      const res4 = await ValidationSchema.joiEns.validateAsync(ens4)
      expect(res4).to.eq(ens4)

      // Case 5: Invalid ENS should be rejected
      await expect(ValidationSchema.joiEns.validateAsync('test!')).to.be.rejectedWith(
        Error,
        '"value" is not a valid ENS',
      )

      // Case 6: Empty string should be rejected
      await expect(ValidationSchema.joiEns.validateAsync('')).to.be.rejectedWith(
        Error,
        '"value" is not allowed to be empty',
      )
    })

    it('generateJoiPagination', async () => {
      const result = await PaginationSchema.getPagination.validateAsync({
        search: '0xb794F5eA0ba39494cE839613fffBA74279579268',
      })

      expect(result.search).to.eq('0xb794F5eA0ba39494cE839613fffBA74279579268')
      expect(result.error).to.be.undefined
      expect(result.pageSize).to.eq(10)
      expect(result.page).to.eq(1)
      expect(result.order).to.eq('asc')
    })

    it('generateJoiPagination wrong address', async () => {
      const result = await PaginationSchema.getPagination.validateAsync({
        search: 'not_a_valid_address',
        page: 1,
        pageSize: 12,
      })

      expect(result.search).to.eq('not_a_valid_address')
      expect(result.error).to.be.undefined
      expect(result.pageSize).to.eq(12)
      expect(result.page).to.eq(1)
      expect(result.order).to.eq('asc')
    })

    it('joiSlug', async () => {
      const validSlug = 'pluginType-123'
      const result = await ValidationSchema.joiSlug.validateAsync(validSlug)
      expect(result).to.equal(validSlug.toLowerCase())

      const anotherValidSlug = 'plugin-0'
      const result2 = await ValidationSchema.joiSlug.validateAsync(anotherValidSlug)
      expect(result2).to.equal(anotherValidSlug)

      await expect(ValidationSchema.joiSlug.validateAsync('pluginType-abc')).to.be.rejectedWith(
        Error,
        '"value" is not a valid Slug',
      )

      await expect(ValidationSchema.joiSlug.validateAsync('pluginType--123')).to.be.rejectedWith(
        Error,
        '"value" is not a valid Slug',
      )

      await expect(ValidationSchema.joiSlug.validateAsync('pluginType-12345678901234567890')).to.be.rejectedWith(
        Error,
        '"value" is not a valid Slug',
      )

      await expect(ValidationSchema.joiSlug.validateAsync('-123')).to.be.rejectedWith(
        Error,
        '"value" is not a valid Slug',
      )

      await expect(ValidationSchema.joiSlug.validateAsync('pluginType123')).to.be.rejectedWith(
        Error,
        '"value" is not a valid Slug',
      )

      const value = { toLowerCase: () => sandbox.stub().throws(new Error('toLowerCase error')) }
      await expect(ValidationSchema.joiSlug.validateAsync(value as any)).to.be.rejectedWith(
        Error,
        '"value" must be a string',
      )
    })

    it('joiAddress', async () => {
      const validAddress = '0xb794f5ea0ba39494ce839613fffba74279579268'
      const checksumAddress = '0xb794F5eA0ba39494cE839613fffBA74279579268'

      const res = await ValidationSchema.joiAddress.validateAsync(validAddress)
      expect(res).to.equal(checksumAddress)
    })

    it('should allow endDate to be after startDate', async () => {
      const startDate = '2023-01-01'
      const endDate = '2023-01-02'

      const result = await PaginationSchema.getPagination.validateAsync({ startDate, endDate })

      expect(result.startDate).to.deep.equal(dayjs.utc(startDate).unix())
      expect(result.endDate).to.deep.equal(dayjs.utc(endDate).unix())
    })

    it('should allow endDate to be after startDate in number', async () => {
      const startDate = 1719577224
      const endDate = 1719577230

      const result = await PaginationSchema.getPagination.validateAsync({ startDate, endDate })

      expect(result.startDate).to.deep.equal(startDate)
      expect(result.endDate).to.deep.equal(endDate)
    })

    it('should handle invalid startDate', async () => {
      const invalidStartDate = 'invalid-date'

      await expect(PaginationSchema.getPagination.validateAsync({ startDate: invalidStartDate })).to.be.rejectedWith(
        Error,
        '"startDate" must be one of [number, date]',
      )
    })

    it('should handle invalid endDate', async () => {
      const startDate = '2023-01-01'
      const invalidEndDate = 'invalid-date'

      await expect(
        PaginationSchema.getPagination.validateAsync({ startDate, endDate: invalidEndDate }),
      ).to.be.rejectedWith(Error, '"endDate" must be one of [number, date]')
    })

    it('should handle endDate before startDate', async () => {
      const startDate = '2023-01-02'
      const endDate = '2023-01-01'

      await expect(PaginationSchema.getPagination.validateAsync({ startDate, endDate })).to.be.rejectedWith(
        Error,
        '"endDate" contains an invalid value',
      )
    })

    it('joiAddress should handle invalid mainnet address', async () => {
      const invalidAddress = '0x123'

      try {
        await ValidationSchema.joiAddress.validateAsync(invalidAddress)
      } catch (error: any) {
        expect(error.message).to.include('is not a valid address')
      }
    })

    it('joiDaoId should validate', async () => {
      const validDaoId = 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
      const checksumAddress = '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254'
      const expectedDaoId = `ethereum-mainnet-${checksumAddress}`

      const res = await ValidationSchema.joiDaoId.validateAsync(validDaoId)
      expect(res).to.equal(expectedDaoId)

      const resultInvalid = await ValidationSchema.joiDaoId.validateAsync(
        'invalid-network-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      )
      const resultValid = await ValidationSchema.joiDaoId.validateAsync('ethereum-mainnet-0x123')
      expect(resultInvalid).to.equal('invalid-network-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254')
      expect(resultValid).to.equal('ethereum-mainnet-0x123')

      const notId = await ValidationSchema.joiDaoId.validateAsync('test')
      expect(notId).to.equal('test')

      const value = 'fake-value'
      sandbox.stub(global, 'RegExp').throws(new Error('RegExp error'))
      const resultValue = await ValidationSchema.joiDaoId.validateAsync(value)
      expect(resultValue).to.equal(value)
    })
  })

  describe('Validate schema', () => {
    it('Should validate params', async () => {
      const schema = Joi.object({
        num: Joi.number().integer(),
        str: Joi.string(),
      })

      const res = await ValidationSchema.validateParams(schema, {
        num: 1,
        str: 'str1',
      })

      expect(res.num).to.eq(1)
      expect(res.str).to.eq('str1')
    })

    it('Should validate params throw nice error', async () => {
      const schema = Joi.object({
        age: Joi.number(),
        date: Joi.date(),
      })
      const params = {
        date: 14,
        age: 'fsdqf',
      }

      let isThrowing = false

      try {
        await ValidationSchema.validateParams(schema, params)
      } catch (error: any) {
        isThrowing = true
        expect(error.message).to.eq(ErrorKeyEnum.badParams)
        expect(error.exposeMeta.validationError.params.date).to.eq(params.date)
        expect(error.exposeMeta.validationError.params.age).to.eq(params.age)
        expect(error.exposeMeta.validationError.errors.length).to.eq(1)
        expect(error.exposeMeta.validationError.errors[0]).to.eq('"age" must be a number')
      }

      expect(isThrowing).to.be.true
    })

    it('Should validate params throw nice error remove password params value', async () => {
      const schema = Joi.object({
        age: Joi.number(),
        date: Joi.date(),
      })
      const params = {
        date: 14,
        age: 'fsdqf',
      }

      let isThrowing = false

      try {
        await ValidationSchema.validateParams(schema, params)
      } catch (error: any) {
        isThrowing = true
        expect(error.message).to.eq(ErrorKeyEnum.badParams)
        expect(error.exposeMeta.validationError.params.date).to.eq(params.date)
        expect(error.exposeMeta.validationError.params.age).to.eq(params.age)
        expect(error.exposeMeta.validationError.errors.length).to.eq(1)
        expect(error.exposeMeta.validationError.errors[0]).to.eq('"age" must be a number')
      }

      expect(isThrowing).to.be.true
    })
  })
})
