import * as sinon from 'sinon'
import { NetworksEnum } from '@types'
import Plugins from './mockData/sppPairMockPlugin.json'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { expect } from 'chai'

describe('PairSppBug', function () {
  let sandbox: sinon.SinonSandbox
  this.timeout(10000000)

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should handle the pairing of species correctly', async () => {
    const txHash = '0x05bf306dadf218eb8d83a081b544031d9ce1c76de3701568afbf015e960d9a6b'
    const network = NetworksEnum.cornMainnet

    const plugins = Plugins.map(plugin => {
      return {
        ...plugin,
        _id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        __v: undefined,
      }
    })

    await Promise.all(plugins.map(async p => await Models.Plugin.create(p)))

    await Models.Dao.create({
      id: 'corn-mainnet-0xBe31BC9278e4745d9D04F4A9113B71Db3Bdc7E43',
      isActive: true,
      isHidden: false,
      network: 'corn-mainnet',
      transactionHash: '0x95c832ae5a148570f57e27cf600cc0fed999c1232fadc4aa8edfe5a515a949f3',
      blockNumber: 640435,
      blockTimestamp: 1750254946,
      address: '0xBe31BC9278e4745d9D04F4A9113B71Db3Bdc7E43',
      implementationAddress: '0x604953e159562FeEfF38961541415B0C0694Ef5A',
      creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      ens: null,
      subdomain: null,
      metadataIpfs: 'ipfs://QmcUGDfvKPgZugPrRPttWUx6rUJxNRdtZsP9MVStZ7JMcu',
      name: '2025-06-18 Corn',
      description: 'asdfasdf',
      avatar: 'ipfs://QmX4q3fu1QkSfdVFUAmSUWziCmnXtitp2TVKLbrFVBcPvv',
      version: '1.4.0',
      metrics: {
        tvlUSD: 0,
        proposalsCreated: 2,
        proposalsExecuted: 1,
        uniqueVoters: 0,
        votes: 0,
        members: 1,
      },
      links: [],
    })

    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)
    const parsedLogs = await UnitDepUtils.parseLogsByConfig(receipt!.logs as any, network)

    for (const log of parsedLogs) {
      await log.handler(log.event, log.info)
    }

    const subProposals = await Models.Proposal.find({
      isSubProposal: true,
    })

    expect(subProposals.length).to.be.eq(10)

    subProposals.forEach((subProposal: any) => {
      expect(subProposal.parentProposal).to.be.not.null
      expect(subProposal.parentProposal.pluginAddress).to.be.eq('0x9F674BC5a486c14e9deb8D27557300a9c0e3CBb7')
    })

    const mainProposal = await Models.Proposal.findOne({
      isSubProposal: false,
    })

    expect(mainProposal.subProposals.length).to.be.eq(10)
  })
})
