import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ValidationSchema from '@helpers/validationSchema'
import Joi from 'joi'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import DaoSchema from '@api/routers/schema/dao'

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

    it('generateJoiDaoPluginPagination', async () => {
      const result = await DaoSchema.getDaoMultisigMembersWithPagination.validateAsync({
        permalink: 'xxx',
        pluginAddress: '0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA',
      })

      expect(result.error).to.be.undefined
      expect(result.limit).to.eq(10)
      expect(result.skip).to.eq(0)
      expect(result.order).to.eq('asc')
    })

    it('generateJoiPagination', async () => {
      const result = await DaoSchema.getWithPagination.validateAsync({
        search: '0xb794F5eA0ba39494cE839613fffBA74279579268',
      })

      expect(result.search).to.eq('0xb794F5eA0ba39494cE839613fffBA74279579268')
      expect(result.error).to.be.undefined
      expect(result.limit).to.eq(10)
      expect(result.skip).to.eq(0)
      expect(result.order).to.eq('asc')
    })

    it('generateJoiPagination wrong address', async () => {
      const result = await DaoSchema.getWithPagination.validateAsync({
        search: 'not_a_valid_address',
        skip: 1,
        limit: 12,
      })

      expect(result.search).to.eq('not_a_valid_address')
      expect(result.error).to.be.undefined
      expect(result.limit).to.eq(12)
      expect(result.skip).to.eq(1)
      expect(result.order).to.eq('asc')
    })

    it('joiAddress', async () => {
      const validAddress = '0xb794f5ea0ba39494ce839613fffba74279579268'
      const checksumAddress = '0xb794F5eA0ba39494cE839613fffBA74279579268'

      const res = await ValidationSchema.joiAddress.validateAsync(validAddress)
      expect(res).to.equal(checksumAddress)
    })

    it('should allow toDate to be after fromDate', async () => {
      const fromDate = '2023-01-01'
      const toDate = '2023-01-02'

      const schema = DaoSchema.getWithPagination

      const result = await schema.validateAsync({ fromDate, toDate })

      expect(result.fromDate).to.deep.equal(new Date(fromDate))
      expect(result.toDate).to.deep.equal(new Date(toDate))
    })

    it('joiAddress should handle invalid Ethereum address', async () => {
      const invalidAddress = '0x123'

      try {
        await ValidationSchema.joiAddress.validateAsync(invalidAddress)
        throw new Error('Should have thrown an error for invalid address')
      } catch (error: any) {
        expect(error.message).to.include('string.invalid')
      }
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
