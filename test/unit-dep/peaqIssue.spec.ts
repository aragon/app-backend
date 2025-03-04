import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQ from '@helpers/rabbitMQ'

describe('Peaq Issue', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQ, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  async function installRepo() {
    const repos = [
      {
        id: 'peaq-mainnet-0xaf2fff600394b1d37fb3ee8c4db3cf42e67b770bc942c84aef83d007026f72a3-0-9',
        transactionHash: '0xaf2fff600394b1d37fb3ee8c4db3cf42e67b770bc942c84aef83d007026f72a3',
        transactionIndex: 0,
        logIndex: 9,
        blockNumber: 4032542,
        blockTimestamp: 1740069708,
        network: 'peaq-mainnet',
        subdomain: 'multisig',
        pluginRepo: '0x83a977d564349586936f17D9536b2c5702B4Fe20',
      },
      {
        id: 'peaq-mainnet-0x9f98e40ad433af72937c4129f90a57408459f647494f292df9992f92ac19cec2-0-9',
        transactionHash: '0x9f98e40ad433af72937c4129f90a57408459f647494f292df9992f92ac19cec2',
        transactionIndex: 0,
        logIndex: 9,
        blockNumber: 4032643,
        blockTimestamp: 1740070338,
        network: 'peaq-mainnet',
        subdomain: 'token-voting',
        pluginRepo: '0xFBFbE98845B4E2751a8A004B5A1759e3A278FC68',
      },
      {
        id: 'peaq-mainnet-0xeaa8afef694113dbc91aafc4c8ab072768a752150926a6fd42271bbaaa70a901-1-10',
        transactionHash: '0xeaa8afef694113dbc91aafc4c8ab072768a752150926a6fd42271bbaaa70a901',
        transactionIndex: 1,
        logIndex: 10,
        blockNumber: 4032714,
        blockTimestamp: 1740070770,
        network: 'peaq-mainnet',
        subdomain: 'admin',
        pluginRepo: '0x86C87Aa7C09a447048adf4197fec7C12eF62A07F',
      },
      {
        id: 'peaq-mainnet-0x0fe819a1a087dd5faa04f0bad2e381da56ecbb15c5afde5b16f0d59943990d8b-0-9',
        transactionHash: '0x0fe819a1a087dd5faa04f0bad2e381da56ecbb15c5afde5b16f0d59943990d8b',
        transactionIndex: 0,
        logIndex: 9,
        blockNumber: 4032890,
        blockTimestamp: 1740071868,
        network: 'peaq-mainnet',
        subdomain: 'spp',
        pluginRepo: '0x2784e9500f8f60C1267e819f216682a88A37d56D',
      },
    ]

    await Promise.all(repos.map(async repo => await Models.PluginRepo.create(repo)))
  }

  it('should solve the peaq issue', async function () {
    this.timeout(1000000)

    await installRepo()

    const txHash1 = '0xa773a396156813db6ec4adc821881b543d713b358d9de316e96c582b4297a856'
    const txHahs = '0x2f12fd1c163d6f5c1f99634c957c6686e941f1ab8693ac3e309650de65051d54'
    const network = NetworksEnum.peaqMainnet

    const receipts = await Web3Helper.getTransactionReceipt(txHash1, network)
    if (!receipts?.logs) return
    const parsedLogByHandler = await UnitDepUtils.parseLogsByConfig(receipts?.logs as any, network)

    for (const ev of parsedLogByHandler) {
      await ev.handler(ev.event, ev.info)
    }

    const dao = await Models.Dao.find({})
    expect(dao.length).to.be.eq(1)

    const pluginReceipts = await Web3Helper.getTransactionReceipt(txHahs, network)
    if (!pluginReceipts?.logs) return

    const parsedLogByHandlerPlugin = await UnitDepUtils.parseLogsByConfig(pluginReceipts?.logs as any, network)
    for (const ev of parsedLogByHandlerPlugin) {
      await ev.handler(ev.event, ev.info)
    }
  })
})
