import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginController from '@services/aragon-api/controllers/plugins'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { NetworksEnum, EnumQueueName } from '@types'
import logger from '@logger'
import { Models } from '@src/models'

describe('Controller: Plugin', () => {
  let sandbox: SinonSandbox
  let loggerWarnStub: sinon.SinonStub
  let loggerInfoStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerWarnStub = sandbox.stub(logger, 'warn')
    loggerInfoStub = sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getInstallationData', () => {
    const pluginAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    const network = NetworksEnum.ethereumMainnet
    const installationData = '{"plugin":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}'

    it('should fetch installation data via RabbitMQ when data is not locally available', async () => {
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(installationData)

      const result = await PluginController.getInstallationData({
        pluginAddress,
        network,
      })

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.args[0][0]).to.equal(EnumQueueName.pluginInstallationData)
      expect(rabbitMqStub.args[0][1]).to.deep.include({
        params: { address: pluginAddress, network },
      })
      expect(rabbitMqStub.args[0][2]).to.deep.include({
        waitResponse: true,
        timeout: config.RABBITMQ.TIMEOUT,
      })
      expect(result).to.equal(installationData)
    })

    it('should log error and re-throw when RabbitMQ sendMessage fails', async () => {
      const rabbitMqError = new Error('RabbitMQ connection failed')
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(rabbitMqError)

      await expect(
        PluginController.getInstallationData({
          pluginAddress,
          network,
        }),
      ).to.be.rejectedWith(Error, 'RabbitMQ connection failed')

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Error while getting plugin installation data')).to.be.true

      const logCall = loggerWarnStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        error: rabbitMqError,
        pluginAddress,
        network,
      })
    })
  })

  describe('getPluginsByDao', () => {
    const daoAddress = '0xe2e445489b0356D3087efF7e79DB7Ff3f16c4fEA'
    const network = NetworksEnum.polygonMainnet
    let findByDaoWithFiltersStub: sinon.SinonStub

    beforeEach(() => {
      findByDaoWithFiltersStub = sandbox.stub(Models.Plugin, 'findByDaoWithFilters')
    })

    it('should call Model.Plugin.findByDaoWithFilters with correct params and return plugins', async () => {
      const mockPlugins = [
        { address: '0xPlugin1', interfaceType: 'tokenVoting', status: 'installed' },
        { address: '0xPlugin2', interfaceType: 'multisig', status: 'installed' },
      ]
      findByDaoWithFiltersStub.resolves(mockPlugins)

      const params = {
        daoAddress,
        network,
      }

      const result = await PluginController.getPluginsByDao(params)

      expect(findByDaoWithFiltersStub.calledOnce).to.be.true
      expect(findByDaoWithFiltersStub.calledWith(params)).to.be.true
      expect(result).to.deep.equal(mockPlugins)
      expect(loggerInfoStub.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Retrieved plugins by DAO')).to.be.true
    })

    it('should pass all filter parameters to findByDaoWithFilters', async () => {
      const interfaceType = 'tokenVoting' as const
      const status = 'installed' as const
      const mockPlugins = [{ address: '0xPlugin1', interfaceType, status }]
      findByDaoWithFiltersStub.resolves(mockPlugins)

      const params: any = {
        daoAddress,
        network,
        interfaceType,
        status,
        isProcess: true,
        isSupported: true,
      }

      const result = await PluginController.getPluginsByDao(params)

      expect(findByDaoWithFiltersStub.calledOnce).to.be.true
      expect(findByDaoWithFiltersStub.calledWith(params)).to.be.true
      expect(result).to.deep.equal(mockPlugins)
    })

    it('should handle empty plugin list returned from model', async () => {
      findByDaoWithFiltersStub.resolves([])

      const params = {
        daoAddress,
        network,
      }

      const result = await PluginController.getPluginsByDao(params)

      expect(findByDaoWithFiltersStub.calledOnce).to.be.true
      expect(result).to.deep.equal([])
      expect(loggerInfoStub.calledOnce).to.be.true
    })

    it('should log error and re-throw when model throws error', async () => {
      const modelError = new Error('Database connection failed')
      findByDaoWithFiltersStub.rejects(modelError)

      const params = {
        daoAddress,
        network,
      }

      await expect(PluginController.getPluginsByDao(params)).to.be.rejectedWith(Error, 'Database connection failed')

      expect(findByDaoWithFiltersStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Error while getting plugins by DAO')).to.be.true

      const logCall = loggerWarnStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        error: modelError,
        params,
      })
    })

    it('should log retrieved plugin count in info log', async () => {
      const status = 'installed' as const
      const interfaceType = 'tokenVoting' as const
      const mockPlugins = [{ address: '0xPlugin1' }, { address: '0xPlugin2' }, { address: '0xPlugin3' }]
      findByDaoWithFiltersStub.resolves(mockPlugins)

      const params: any = {
        daoAddress,
        network,
        status,
        interfaceType,
      }

      await PluginController.getPluginsByDao(params)

      expect(findByDaoWithFiltersStub.calledOnce).to.be.true
      const logCall = loggerInfoStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        daoAddress,
        network,
        count: 3,
        filters: params,
      })
    })
  })
})
