import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import { LibUtils } from '@test/lib/unit-dep/lib'

describe('Integ: Uninstall Plugins', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('Uninstall SPP with subplugin flow', () => {
    const networks = [
      {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0x109052a3beaD6ab63958e42feD30694243ed1A8a',
        fromBlock: 9360716,
        toBlock: 9367364,
      },
    ]

    for (const { network, daoAddress, fromBlock, toBlock } of networks) {
      it(`should handle uninstall all plugins properly ${network}`, async function () {
        this.timeout(100000000)

        const libUtils = new LibUtils({
          daoAddress,
          network,
          config: {
            sandbox,
            blockLimit: toBlock,
          },
        })
        await libUtils.syncCompleteDao(fromBlock)

        const plugins = await Models.Plugin.find({ daoAddress }).lean()
        const allPlugins = plugins.filter(
          w => w.status === IPluginStatus.uninstalled || w.status === IPluginStatus.abandoned,
        )
        expect(allPlugins.length).to.equal(7)
      })
    }
  })
})
