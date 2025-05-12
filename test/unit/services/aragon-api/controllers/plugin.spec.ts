import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import PluginController from '@services/aragon-api/controllers/plugins'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { NetworksEnum, EnumQueueName } from '@types'

describe('Controller: Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
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
  })
})
