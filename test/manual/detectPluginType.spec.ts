import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import pluginDetector from '@helpers/pluginDetector'

describe('Manual: DetectPluginType', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getLogs StagesUpdated', async () => {
    await ProviderModule.connectToAllNetworks()

    const spp = await pluginDetector.detectPluginType(
      '0x487fb7ADE20923FA31767cbb2d84D4E5bfe507d0',
      NetworksEnum.ethereumSepolia,
    )
    console.log(spp)

    const multisig = await pluginDetector.detectPluginType(
      '0x3E391bca8ac97d069b4b8ECeF63A0885B5a086BD',
      NetworksEnum.ethereumSepolia,
    )
    console.log(multisig)

    const token = await pluginDetector.detectPluginType(
      '0xd84dd47d26fd5002f8F4e556F9f99632da62FDEb',
      NetworksEnum.ethereumSepolia,
    )
    console.log(token)
  })
})
