import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { CustomInstall } from '@indexer/customInstall'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogGauge } from '@plugins/logGauge'
import { expect } from 'chai'
import { IPluginStatus } from '@types'

describe('Manual: CustomInstall', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('customInstall DAO', async function () {
    this.timeout(1600000) // Increase timeout for the test

    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    await ProviderModule.connectToAllNetworks()

    await CustomInstall.install()

    const plugin = await Models.Plugin.findOne({ address: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E' })
    const token = await Models.Token.findOne({ address: plugin.tokenAddress })
    expect(plugin.isSupported).to.be.true
    expect(plugin.status).to.eq(IPluginStatus.installed)
    expect(plugin.tokenAddress).to.eq('0x1b6ec227ceBeC25118270efbb4b67642fc29965E')
    expect(plugin.daoAddress).to.eq('0x5dEA8E499b05de8F86E7521F039770268055b23F')
    expect(token.holders > 0).to.be.true

    await LogGauge.start(plugin, token)
    console.log('done')
  })
})
