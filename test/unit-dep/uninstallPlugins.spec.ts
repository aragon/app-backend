import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import type Plugin from '@models/schema/plugin'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'

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
      },
    ]

    for (const { network, daoAddress } of networks) {
      it(`should handle uninstall all plugins properly ${network}`, async function () {
        this.timeout(100000000)

        UnitDepUtils.stubRabbitmqSend(sandbox)

        await UnitDepUtils.syncACompleteDao(daoAddress, network)

        const plugins = await Models.Plugin.find({ daoAddress }).lean()
        const allPlugins = plugins.filter(w => w.interfaceType !== IPluginInterfaceType.admin)

        allPlugins.map((plugin: Plugin) => {
          expect(plugin.status === IPluginStatus.uninstalled || plugin.status === IPluginStatus.abandoned).to.be.true
        })
      })
    }
  })
})
