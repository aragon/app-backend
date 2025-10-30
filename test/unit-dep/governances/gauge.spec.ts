import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import { LogGauge } from '@plugins/logGauge'
import GaugeController from '@api/controllers/gauge'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { GaugeInfo } from '@services/aragon-gateway/gauge'

describe('Integ: Gauge', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('Gauge flow', () => {
    const networks = [
      {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0x0A00c7BA3B0e23363991D4BA7E83a10Fc48969d8',
      },
    ]

    for (const { network, daoAddress } of networks) {
      it(`should handle gauge all events properly ${network}`, async function () {
        this.timeout(100000000)

        const fromBlock = 9325905
        const rabbitMQStub = UnitDepUtils.stubRabbitmqSend(sandbox) as any

        await UnitDepUtils.syncACompleteDao(daoAddress, network, fromBlock)
        const plugin = await Models.Plugin.findOne({
          interfaceType: IPluginInterfaceType.gauge,
        })
        expect(plugin.isSupported).to.be.true

        const token = await Models.Token.findOne({
          address: plugin.tokenAddress,
        })
        expect(token.symbol).to.exist
        expect(token.name).to.exist

        await LogGauge.start(plugin)

        const dbGauges = await Models.Gauge.find({ pluginAddress: plugin.address, network: plugin.network })
        expect(dbGauges?.length > 0).to.be.true

        rabbitMQStub.restore()
        sandbox.stub(RabbitMQHelper, 'sendMessage').resolves('0')
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
        const data = apiGauges.data[0] as any
        expect(data.metrics.totalMemberVoteCount).to.eq(0)
        expect(data.metrics.currentEpochVotingPower).to.eq('0')
        expect(data.metrics.totalGaugeVotingPower).to.eq('0')
        expect(data.metrics.epochId).to.eq('0')
      })
    }
  })

  it('getGaugeInfo - should handle gauge fetch live info', async function () {
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x9910F6A4e536f90b00b771EeD6B08BAdb5c43717'

    const plugin = await Models.Plugin.create({
      id: `${network}-${pluginAddress}-0`,
      transactionHash: '0xplugintx',
      blockNumber: 50,
      network,
      address: pluginAddress,
      interfaceType: IPluginInterfaceType.tokenVoting,
      status: IPluginStatus.installed,
      daoAddress: '0x0A00c7BA3B0e23363991D4BA7E83a10Fc48969d8',
      tokenAddress: '0x2fD483f98B7344f5DFfA943bC0D787d6760813df',
      isSupported: true,
    })

    const gaugeInfo = await GaugeInfo.getGaugeInfo({
      pluginAddress,
      memberAddress: '0x0A00c7BA3B0e23363991D4BA7E83a10Fc48969d8',
      network,
    })

    expect(gaugeInfo?.pluginAddress).to.equal(plugin.address)
    expect(gaugeInfo?.network).to.equal(plugin.network)
    expect(BigInt(gaugeInfo?.epochId!) >= BigInt(1456)).to.be.true
    expect(BigInt(gaugeInfo?.totalVotingPower!) >= BigInt(0)).to.be.true
    expect(gaugeInfo?.enableUpdateVotingPowerHook).to.equal(true)
    expect(gaugeInfo?.currentEpochStart).to.be.gte(1761177600)
    expect(gaugeInfo?.epochVoteStart).to.be.gte(1761177600)
    expect(gaugeInfo?.epochVoteEnd).to.be.gte(1761177600)
    expect(gaugeInfo?.memberAddress).to.eq('0x0A00c7BA3B0e23363991D4BA7E83a10Fc48969d8')
    expect(BigInt(gaugeInfo?.memberUsedVotingPower!) >= BigInt(0)).to.be.true
    expect(BigInt(gaugeInfo?.memberVotingPower!) >= BigInt(0)).to.be.true
  })
})
