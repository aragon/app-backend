import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import GaugeController from '@services/aragon-api/controllers/gauge'
import { Models } from '@dbModels'
import { EnumQueueName, ErrorKeyEnum, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'

describe.only('Controller: Gauge', () => {
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

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      const findWithPaginationStub = sandbox.stub(Models.Gauge, 'findWithPagination').resolves(mockResponse)

      const response = await GaugeController.getGaugesWithPagination(paginationParams, filterParams)

      // Verify RabbitMQ message was sent with correct params
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(rabbitMQStub.args[0][0]).to.eq(EnumQueueName.gaugeEpochId)
      expect(rabbitMQStub.args[0][1]).to.deep.eq({
        id: `${pluginAddress}-${network}`,
        params: {
          pluginAddress,
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

    it('should throw error when epochId is not returned from RabbitMQ', async () => {
      const pluginAddress = '0xPluginNotFound111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const filterParams: any = {
        network,
        pluginAddress,
      }

      // Stub RabbitMQ to return null/undefined epochId
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

      try {
        await GaugeController.getGaugesWithPagination({}, filterParams)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
        expect(error.message).to.eq(ErrorKeyEnum.notFound)
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

      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ connection error'))

      try {
        await GaugeController.getGaugesWithPagination({}, filterParams)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('RabbitMQ connection error')
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

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').resolves({
        data: [],
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
      })

      await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(rabbitMQStub.args[0]?.[2]?.timeout).to.eq(config.RABBITMQ.TIMEOUT)
      expect(rabbitMQStub.args[0]?.[2]?.waitResponse).to.be.true
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

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(epochId)
      sandbox.stub(Models.Gauge, 'findWithPagination').resolves({
        data: [],
        metadata: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 },
      })

      await GaugeController.getGaugesWithPagination({}, filterParams)

      expect(rabbitMQStub.args[0][0]).to.eq(EnumQueueName.gaugeEpochId)
    })
  })

  describe('getGaugeEpochMetrics', () => {
    it('should get gauge epoch metrics successfully', async () => {
      const pluginAddress = '0xPlugin111111111111111111111111111111111'
      const memberAddress = '0xMember1111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        interfaceType: 'gauge',
      }

      const mockGaugeInfo = {
        pluginAddress,
        network,
        memberAddress,
        epochId: '5',
        totalVotingPower: '1000000000000000000',
        memberVotingPower: '100000000000000000',
        memberUsedVotingPower: '50000000000000000',
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockGaugeInfo)

      const response = await GaugeController.getGaugeEpochMetrics({
        pluginAddress,
        memberAddress,
        network
      })

      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.args[0][0]).to.deep.eq({
        interfaceType: 'gauge',
        address: pluginAddress,
      })

      expect(rabbitMQStub.calledOnce).to.be.true
      expect(rabbitMQStub.args[0][0]).to.eq(EnumQueueName.gaugeInfo)
      expect(rabbitMQStub.args[0][1]).to.deep.eq({
        id: `${pluginAddress}-${network}`,
        params: {
          pluginAddress,
          memberAddress,
          network,
        },
      })
      expect(rabbitMQStub.args[0][2]).to.deep.eq({
        waitResponse: true,
        timeout: config.RABBITMQ.TIMEOUT,
      })

      expect(response).to.deep.eq(mockGaugeInfo)
    })

    it('should throw error when plugin not found', async () => {
      const pluginAddress = '0xPluginNotFound111111111111111111111111'
      const memberAddress = '0xMember1111111111111111111111111111111111'

      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      try {
        await GaugeController.getGaugeEpochMetrics({
          pluginAddress,
          memberAddress,
          network: NetworksEnum.ethereumMainnet,
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
        expect(error.message).to.eq(ErrorKeyEnum.notFound)
      }
    })

    it('should throw error when gaugeInfo is not returned from RabbitMQ', async () => {
      const pluginAddress = '0xPlugin222222222222222222222222222222222'
      const memberAddress = '0xMember2222222222222222222222222222222222'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        interfaceType: 'gauge',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

      try {
        await GaugeController.getGaugeEpochMetrics({
          pluginAddress,
          memberAddress,
          network
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.exist
        expect(error.message).to.eq(ErrorKeyEnum.notFound)
      }
    })

    it('should handle different network types', async () => {
      const pluginAddress = '0xPlugin333333333333333333333333333333333'
      const memberAddress = '0xMember3333333333333333333333333333333333'
      const network = NetworksEnum.arbitrumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        interfaceType: 'gauge',
      }

      const mockGaugeInfo = {
        pluginAddress,
        network,
        memberAddress,
        epochId: '10',
        totalVotingPower: '5000000000000000000',
        memberVotingPower: '500000000000000000',
        memberUsedVotingPower: '250000000000000000',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockGaugeInfo)

      const response = await GaugeController.getGaugeEpochMetrics({
        pluginAddress,
        memberAddress,
        network
      })

      expect(rabbitMQStub.args[0][1].id).to.eq(`${pluginAddress}-${network}`)
      expect(response).to.deep.eq(mockGaugeInfo)
    })

    it('should pass correct RabbitMQ timeout from config', async () => {
      const pluginAddress = '0xPlugin444444444444444444444444444444444'
      const memberAddress = '0xMember4444444444444444444444444444444444'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        interfaceType: 'gauge',
      }

      const mockGaugeInfo = {
        pluginAddress,
        network,
        memberAddress,
        epochId: '3',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockGaugeInfo)

      await GaugeController.getGaugeEpochMetrics({
        pluginAddress,
        memberAddress,
        network
      })

      expect(rabbitMQStub.args[0]?.[2]?.timeout).to.eq(config.RABBITMQ.TIMEOUT)
      expect(rabbitMQStub.args[0]?.[2]?.waitResponse).to.be.true
    })

    it('should handle when RabbitMQ throws an error', async () => {
      const pluginAddress = '0xPlugin555555555555555555555555555555555'
      const memberAddress = '0xMember5555555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet

      const mockPlugin = {
        address: pluginAddress,
        network,
        interfaceType: 'gauge',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin as any)
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ connection error'))

      try {
        await GaugeController.getGaugeEpochMetrics({
          pluginAddress,
          memberAddress,
          network
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error).to.be.an('error')
        expect(error.message).to.equal('RabbitMQ connection error')
      }
    })
  })
})
