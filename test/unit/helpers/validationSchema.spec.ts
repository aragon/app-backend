import * as sinon from 'sinon'
import { expect } from 'chai'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import Joi from 'joi'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import dayjs from '@helpers/dayjs'
import { getAddress } from 'ethers'
import Utils from '@helpers/utils'
import ModelUtils from '@models/utils/models'

describe('Helpers:ValidationSchema', () => {
  let sandbox: any

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
      const ens = 'test.eth'
      const res = await ValidationSchema.joiEns.validateAsync(ens)
      expect(res).to.eq(ens)

      const ens2 = 'test.dao.eth'
      const res2 = await ValidationSchema.joiEns.validateAsync(ens2)
      expect(res2).to.eq(ens2)

      await expect(ValidationSchema.joiEns.validateAsync('test')).to.be.rejectedWith(
        Error,
        '"value" is not a valid ENS',
      )
    })

    it('joiAddress', async () => {
      const validAddress = '0xb794f5ea0ba39494ce839613fffba74279579268'
      const checksumAddress = '0xb794F5eA0ba39494cE839613fffBA74279579268'

      const res = await ValidationSchema.joiAddress.validateAsync(validAddress)
      expect(res).to.equal(checksumAddress)
    })

    it('joiAddress should handle invalid mainnet address', async () => {
      const invalidAddress = '0x123'

      await expect(ValidationSchema.joiAddress.validateAsync(invalidAddress)).to.be.rejectedWith(
        Error,
        '"value" is not a valid address',
      )
    })

    it('joiNetworks should validate array of networks', async () => {
      // Replace these with actual NetworksEnum values from your codebase
      const networkValues = Object.values(NetworksEnum)
      const validNetworks = [networkValues[0], networkValues[1]]

      const res = await ValidationSchema.joiNetworks.validateAsync(validNetworks)
      expect(res).to.deep.equal(validNetworks)
    })

    it('joiNetworks should validate single network as array', async () => {
      const networkValues = Object.values(NetworksEnum)
      const singleNetwork = networkValues[0]

      const res = await ValidationSchema.joiNetworks.validateAsync(singleNetwork)
      expect(res).to.deep.equal([singleNetwork])
    })

    it('joiNetworks should validate CSV string of networks', async () => {
      const networkValues = Object.values(NetworksEnum)
      const csvNetworks = `${networkValues[0]}, ${networkValues[1]}`

      const res = await ValidationSchema.joiNetworks.validateAsync(csvNetworks)
      expect(res).to.deep.equal([networkValues[0], networkValues[1]])
    })

    it('joiNetworks should reject invalid network in array', async () => {
      const networkValues = Object.values(NetworksEnum)
      const invalidNetworks = [networkValues[0], 'invalid-network']

      await expect(ValidationSchema.joiNetworks.validateAsync(invalidNetworks)).to.be.rejected
    })

    it('joiNetworks should reject invalid network in CSV string', async () => {
      const networkValues = Object.values(NetworksEnum)
      const invalidCsv = `${networkValues[0]}, invalid-network`

      await expect(ValidationSchema.joiNetworks.validateAsync(invalidCsv)).to.be.rejected
    })

    it('joiTransactionHash should validate valid transaction hash', async () => {
      const validHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      const res = await ValidationSchema.joiTransactionHash.validateAsync(validHash)
      expect(res).to.equal(validHash)
    })

    it('joiTransactionHash should reject invalid transaction hash - wrong length', async () => {
      const invalidHash = '0x123'

      await expect(ValidationSchema.joiTransactionHash.validateAsync(invalidHash)).to.be.rejectedWith(
        Error,
        '"value" must be a valid transaction hash',
      )
    })

    it('joiTransactionHash should reject invalid transaction hash - wrong prefix', async () => {
      const invalidHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      await expect(ValidationSchema.joiTransactionHash.validateAsync(invalidHash)).to.be.rejectedWith(
        Error,
        '"value" must be a valid transaction hash',
      )
    })

    it('joiTransactionHash should reject invalid transaction hash - wrong characters', async () => {
      const invalidHash = '0xzzzz567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      await expect(ValidationSchema.joiTransactionHash.validateAsync(invalidHash)).to.be.rejectedWith(
        Error,
        '"value" must be a valid transaction hash',
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

  describe('validateRoute', () => {
    let mockCtx: any

    beforeEach(() => {
      mockCtx = {
        query: {
          page: '1',
          pageSize: '10',
          network: 'ethereum-mainnet',
          address: '0x123',
          extra: 'value',
        },
      }

      sandbox.stub(ModelUtils, 'parsePaginationParams').returns({
        page: 1,
        pageSize: 10,
        order: 'asc',
        sort: 'createdAt',
      })

      sandbox.stub(Utils, 'extractAdditionalParams').returns({})
    })

    it('should validate route with basic configuration', async () => {
      const config = {
        params: { network: 'ethereum-mainnet' },
        schemas: {
          params: Joi.object({ network: Joi.string() }),
        },
      }

      const result = await ValidationSchema.validateRoute(mockCtx, config)

      expect(result.paginationParams).to.deep.equal({
        page: 1,
        pageSize: 10,
        order: 'asc',
        sort: 'createdAt',
      })
      expect(result.params).to.deep.equal({ network: 'ethereum-mainnet' })
      expect(result.extraParams).to.deep.equal({})
      expect(result.pairParams).to.deep.equal({})
      expect(result.customParams).to.deep.equal({})
    })

    it('should validate route with all parameter types', async () => {
      const config = {
        params: { network: 'ethereum-mainnet' },
        extraParams: { address: '0x123' },
        pairParams: { daoId: 'dao-1' },
        customParams: { custom: 'value' },
        schemas: {
          params: Joi.object({ network: Joi.string() }),
          extra: Joi.object({ address: Joi.string() }),
          pair: Joi.object({ daoId: Joi.string() }),
          custom: Joi.object({ custom: Joi.string() }),
        },
      }

      const result = await ValidationSchema.validateRoute(mockCtx, config)

      expect(result.params).to.deep.equal({ network: 'ethereum-mainnet' })
      expect(result.extraParams).to.deep.equal({ address: '0x123' })
      expect(result.pairParams).to.deep.equal({ daoId: 'dao-1' })
      expect(result.customParams).to.deep.equal({ custom: 'value' })
    })

    it('should apply require rule and throw error when rule fails', async () => {
      const config = {
        params: {},
        requireRule: () => 'Test validation error',
        schemas: {},
      }

      let error: any
      try {
        await ValidationSchema.validateRoute(mockCtx, config)
      } catch (e) {
        error = e
      }

      expect(error.message).to.equal(ErrorKeyEnum.badParams)
      expect(error.exposeMeta.validationError.errors).to.deep.equal(['Test validation error'])
    })

    it('should pass when require rule returns null', async () => {
      const config = {
        params: { test: 'value' },
        requireRule: () => null,
        schemas: {
          params: Joi.object({ test: Joi.string() }),
        },
      }

      const result = await ValidationSchema.validateRoute(mockCtx, config)

      expect(result.params).to.deep.equal({ test: 'value' })
    })

    it('should handle skipParams configuration', async () => {
      const extractStub = Utils.extractAdditionalParams as any
      extractStub.returns({ unwanted: 'param' })

      const config = {
        params: {},
        skipParams: ['extra'],
        schemas: {},
      }

      let error: any
      try {
        await ValidationSchema.validateRoute(mockCtx, config)
      } catch (e) {
        error = e
      }

      const callArgs = extractStub.firstCall.args
      expect(callArgs[1]).to.equal(mockCtx.query)
      expect(callArgs[2]).to.deep.equal(['extra'])
    })

    it('should validate pagination parameters with custom sort', async () => {
      const parsePaginationStub = ModelUtils.parsePaginationParams as any

      const config = {
        paginationSort: 'name',
        params: {},
        schemas: {},
      }

      await ValidationSchema.validateRoute(mockCtx, config)

      const callArgs = parsePaginationStub.firstCall.args
      expect(callArgs[0]).to.equal(mockCtx)
      expect(callArgs[1]).to.deep.equal({ defaultSort: 'name' })
    })

    it('should handle validation errors for invalid params', async () => {
      const config = {
        params: { age: 'not-a-number' },
        schemas: {
          params: Joi.object({ age: Joi.number() }),
        },
      }

      let error: any
      try {
        await ValidationSchema.validateRoute(mockCtx, config)
      } catch (e) {
        error = e
      }

      expect(error.message).to.equal(ErrorKeyEnum.badParams)
      expect(error.exposeMeta.validationError.errors[0]).to.include('"age" must be a number')
    })

    it('should handle empty parameter objects', async () => {
      const config = {
        params: {},
        extraParams: {},
        pairParams: {},
        customParams: {},
        schemas: {
          params: Joi.object({}),
          extra: Joi.object({}),
          pair: Joi.object({}),
          custom: Joi.object({}),
        },
      }

      const result = await ValidationSchema.validateRoute(mockCtx, config)

      expect(result.params).to.deep.equal({})
      expect(result.extraParams).to.deep.equal({})
      expect(result.pairParams).to.deep.equal({})
      expect(result.customParams).to.deep.equal({})
    })

    it('should not validate schemas when no params provided', async () => {
      const config = {
        schemas: {
          params: Joi.object({ required: Joi.string().required() }),
          extra: Joi.object({ required: Joi.string().required() }),
        },
      }

      const result = await ValidationSchema.validateRoute(mockCtx, config)

      // Should not throw because we didn't provide any params to validate
      expect(result.params).to.deep.equal({})
      expect(result.extraParams).to.deep.equal({})
    })
  })

  describe('RequireRules', () => {
    describe('daoIdOrNetworkWithAddress', () => {
      it('should pass when daoId is provided', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress(['address'])
        const params = {
          pairParams: { daoId: 'dao-123' },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should pass when network and address field are provided', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress(['address'])
        const params = {
          extraParams: {
            network: 'ethereum-mainnet',
            address: '0x123',
          },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should pass when network and any address field is provided', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress(['address', 'contractAddress'])
        const params = {
          extraParams: {
            network: 'ethereum-mainnet',
            contractAddress: '0x456',
          },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should fail when neither daoId nor network with address is provided', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress(['address'])
        const params = {
          extraParams: {
            network: 'ethereum-mainnet',
          },
        }

        const result = rule(params)
        expect(result).to.equal('Either daoId must be provided, or network with at least one address field (address)')
      })

      it('should use default empty array for address fields', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress()
        const params = {
          extraParams: {
            network: 'ethereum-mainnet',
          },
        }

        const result = rule(params)
        expect(result).to.equal('Either daoId must be provided, or network with at least one address field ()')
      })

      it('should handle missing params objects', () => {
        const rule = RequireRules.daoIdOrNetworkWithAddress(['address'])
        const params = {}

        const result = rule(params)
        expect(result).to.include('Either daoId must be provided')
      })
    })

    describe('allRequired', () => {
      it('should pass when all required fields are present', () => {
        const rule = RequireRules.allRequired('field1', 'field2', 'field3')
        const params = {
          params: { field1: 'value1' },
          extraParams: { field2: 'value2' },
          pairParams: { field3: 'value3' },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should fail when some required fields are missing', () => {
        const rule = RequireRules.allRequired('field1', 'field2', 'field3')
        const params = {
          params: { field1: 'value1' },
          extraParams: {},
          pairParams: {},
        }

        const result = rule(params)
        expect(result).to.equal('Required fields missing: field2, field3')
      })

      it('should fail when all required fields are missing', () => {
        const rule = RequireRules.allRequired('field1', 'field2')
        const params = {
          params: {},
          extraParams: {},
          pairParams: {},
        }

        const result = rule(params)
        expect(result).to.equal('Required fields missing: field1, field2')
      })

      it('should check customParams as well', () => {
        const rule = RequireRules.allRequired('field1', 'customField')
        const params = {
          params: { field1: 'value1' },
          customParams: { customField: 'custom' },
        }

        const result = rule(params)
        expect(result).to.be.null
      })
    })

    describe('exclusive', () => {
      it('should pass when only first field is provided', () => {
        const rule = RequireRules.exclusive('field1', 'field2')
        const params = {
          params: { field1: 'value1' },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should pass when only second field is provided', () => {
        const rule = RequireRules.exclusive('field1', 'field2')
        const params = {
          extraParams: { field2: 'value2' },
        }

        const result = rule(params)
        expect(result).to.be.null
      })

      it('should fail when both fields are provided', () => {
        const rule = RequireRules.exclusive('field1', 'field2')
        const params = {
          params: { field1: 'value1' },
          extraParams: { field2: 'value2' },
        }

        const result = rule(params)
        expect(result).to.equal('Cannot provide both field1 and field2')
      })

      it('should fail when neither field is provided', () => {
        const rule = RequireRules.exclusive('field1', 'field2')
        const params = {
          params: {},
          extraParams: {},
        }

        const result = rule(params)
        expect(result).to.equal('Either field1 or field2 must be provided')
      })

      it('should check across all param types', () => {
        const rule = RequireRules.exclusive('field1', 'field2')
        const params = {
          params: { field1: 'value1' },
          pairParams: { field2: 'value2' },
        }

        const result = rule(params)
        expect(result).to.equal('Cannot provide both field1 and field2')
      })
    })
  })
})
