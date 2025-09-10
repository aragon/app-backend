import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginController from '@services/aragon-api/controllers/plugins'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { NetworksEnum, EnumQueueName } from '@types'
import logger from '@logger'

describe('Controller: Plugin', () => {
  let sandbox: SinonSandbox
  let loggerWarnStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerWarnStub = sandbox.stub(logger, 'warn')
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
})
