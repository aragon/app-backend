import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import { LogGauge } from '@plugins/logGauge'
import GaugeController from '@api/controllers/gauge'

describe.only('Integ: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe.only('Gauge flow', () => {
    const networks = [
      {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0x0A00c7BA3B0e23363991D4BA7E83a10Fc48969d8',
      },
    ]

    for (const { network, daoAddress } of networks) {
      it(`should handle veLock all events properly ${network}`, async function () {
        this.timeout(100000000)

        UnitDepUtils.stubRabbitmqSend(sandbox)

        await UnitDepUtils.syncACompleteDao(daoAddress, network)
        const plugin = await Models.Plugin.findOne({
          interfaceType: IPluginInterfaceType.gauge,
        })
        expect(plugin.isSupported).to.be.true

        await LogGauge.start(plugin)

        const dbGauges = await Models.Gauge.find({ pluginAddress: plugin.address, network: plugin.network })
        expect(dbGauges?.length > 0).to.be.true

        const apiGauges = await GaugeController.getGaugesWithPagination(
          {
            page: 1,
            limit: 100,
            sort: 'blockNumber',
            order: 'desc',
          },
          {
            network,
            pluginAddress: plugin.address,
          },
        )
        expect(apiGauges.data[0].network).to.exist
        expect(apiGauges.data[0].blockNumber).to.exist
        expect(apiGauges.data[0].transactionHash).to.exist
        expect(apiGauges.data[0].address).to.exist
        expect(apiGauges.data[0].pluginAddress).to.exist
        expect(apiGauges.data[0].creatorAddress).to.exist
        expect(apiGauges.data[0].isActive).to.exist
      })
    }
  })
})
