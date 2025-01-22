import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { CustomInstall } from '@indexer/customInstall'
import { RabbitMQHelper } from '@helpers/radditMQ'
import { LogGauge } from '@plugins/logGauge'

describe('Manual: CustomInstall', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('customInstall DAO', async function () {
    this.timeout(1600000) // Increase timeout for the test

    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    await ProviderModule.connectToAllNetworks()

    await CustomInstall.install()

    const plugin = await Models.Plugin.findOne({ address: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E' })
    const token = await Models.Token.findOne({ address: plugin.tokenAddress })
    console.log(plugin)
    console.log(token)

    await LogGauge.start(plugin, token)
    console.log('done')
  })
})
