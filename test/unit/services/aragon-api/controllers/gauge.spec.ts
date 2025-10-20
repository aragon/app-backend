import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import GaugeController from '@services/aragon-api/controllers/gauge'
import { Models } from '@dbModels'
import { EnumQueueName, ErrorKeyEnum, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'

describe('Controller: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getGaugesWithPagination', () => {
    it('should get gauges with pagination - fetches epochId and calls findWithPagination', async () => {
      const pluginAddress = '0xPlugin111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet
      const gaugeAddress = '0xGauge1111111111111111111111111111111111'
      const epochId = '5'

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      const mockResponse = {
        data: [mockGauge],
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      const findOneStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      const findWithPaginationStub = sandbox.stub(Models.Gauge, 'findWithPagination').resolves(mockResponse)

      const response = await GaugeController.getGaugesWithPagination(paginationParams, filterParams)

      // Verify findOne was called with correct params
      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.calledWith({ pluginAddress, network })).to.be.true

      // Verify RabbitMQ message was sent with correct params
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(rabbitMQStub.args[0][0]).to.eq(EnumQueueName.gaugeEpochId)
      expect(rabbitMQStub.args[0][1]).to.deep.eq({
        id: `${pluginAddress}-${network}`,
        params: {
          gaugeAddress,
          network,
        },
      })
      expect(rabbitMQStub.args[0][2]).to.deep.eq({
        waitResponse: true,
        timeout: config.RABBITMQ.TIMEOUT,
      })

      // Verify findWithPagination was called with epochId added to params
      expect(findWithPaginationStub.calledOnce).to.be.true
      expect(findWithPaginationStub.args[0][0]).to.deep.eq({
        params: {
          ...filterParams,
          epochId,
        },
        paginationParams,
      })

      expect(response).to.deep.eq(mockResponse)
    })

    it('should throw error when gauge is not found', async () => {
      const pluginAddress = '0xPluginNotFound111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const filterParams: any = {
        network,
        pluginAddress,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(null)

      try {
        await GaugeController.getGaugesWithPagination({}, filterParams)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
        expect(error.key).to.eq(ErrorKeyEnum.notFound)
      }
    })

    it('should handle different network and pagination params', async () => {
      const pluginAddress = '0xPlugin222222222222222222222222222222222'
      const network = NetworksEnum.arbitrumMainnet
      const gaugeAddress = '0xGauge2222222222222222222222222222222222'
      const epochId = '10'

      const paginationParams = {
        pageSize: 20,
        page: 2,
        order: 'desc',
        sort: 'blockNumber',
      }

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      const mockResponse = {
        data: [],
        metadata: {
          page: 2,
          pageSize: 20,
          totalPages: 1,
          totalRecords: 0,
        },
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      const findWithPaginationStub = sandbox.stub(Models.Gauge, 'findWithPagination').resolves(mockResponse)

      const response = await GaugeController.getGaugesWithPagination(paginationParams, filterParams)

      expect(findWithPaginationStub.calledOnce).to.be.true
      expect(findWithPaginationStub.args[0][0].params.epochId).to.eq(epochId)
      expect(response).to.deep.eq(mockResponse)
    })

    it('should handle when RabbitMQ returns different epochId values', async () => {
      const pluginAddress = '0xPlugin333333333333333333333333333333333'
      const network = NetworksEnum.polygonMainnet
      const gaugeAddress = '0xGauge3333333333333333333333333333333333'
      const epochId = '999'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      const mockResponse = {
        data: [mockGauge],
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      const findWithPaginationStub = sandbox.stub(Models.Gauge, 'findWithPagination').resolves(mockResponse)

      await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(findWithPaginationStub.args[0][0].params.epochId).to.eq(epochId)
    })

    it('should handle when findWithPagination returns empty results', async () => {
      const pluginAddress = '0xPlugin444444444444444444444444444444444'
      const network = NetworksEnum.baseMainnet
      const gaugeAddress = '0xGauge4444444444444444444444444444444444'
      const epochId = '1'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      const mockResponse = {
        data: [],
        metadata: {
          page: 1,
          pageSize: 10,
          totalPages: 0,
          totalRecords: 0,
        },
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').resolves(mockResponse)

      const response = await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(response).to.have.property('data').with.lengthOf(0)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(0)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should handle when RabbitMQ throws an error', async () => {
      const pluginAddress = '0xPlugin555555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet
      const gaugeAddress = '0xGauge5555555555555555555555555555555555'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ connection error'))

      try {
        await GaugeController.getGaugesWithPagination({}, filterParams)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('RabbitMQ connection error')
      }
    })

    it('should handle when findWithPagination throws an error', async () => {
      const pluginAddress = '0xPlugin666666666666666666666666666666666'
      const network = NetworksEnum.ethereumMainnet
      const gaugeAddress = '0xGauge6666666666666666666666666666666666'
      const epochId = '7'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').rejects(new Error('DB connection error'))

      try {
        await GaugeController.getGaugesWithPagination({}, filterParams)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('DB connection error')
      }
    })

    it('should pass correct RabbitMQ timeout from config', async () => {
      const pluginAddress = '0xPlugin777777777777777777777777777777777'
      const network = NetworksEnum.ethereumMainnet
      const gaugeAddress = '0xGauge7777777777777777777777777777777777'
      const epochId = '3'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').resolves({
        data: [],
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
      })

      await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(rabbitMQStub.args[0][2].timeout).to.eq(config.RABBITMQ.TIMEOUT)
      expect(rabbitMQStub.args[0][2].waitResponse).to.be.true
    })

    it('should use correct queue name for epochId request', async () => {
      const pluginAddress = '0xPlugin888888888888888888888888888888888'
      const network = NetworksEnum.ethereumMainnet
      const gaugeAddress = '0xGauge8888888888888888888888888888888888'
      const epochId = '15'

      const filterParams: any = {
        network,
        pluginAddress,
      }

      const mockGauge = {
        address: gaugeAddress,
        pluginAddress,
        network,
        isActive: true,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').resolves({
        data: [],
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
      })

      await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(rabbitMQStub.args[0][0]).to.eq(EnumQueueName.gaugeEpochId)
    })
  })
})
