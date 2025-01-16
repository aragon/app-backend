import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { CustomInstall } from '@indexer/customInstall'
import { RabbitMQHelper } from '@helpers/radditMQ'

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

    const plugins = await Models.Plugin.find({ daoAddress: '0x5dEA8E499b05de8F86E7521F039770268055b23F' })
    console.log(plugins)
  })
})
