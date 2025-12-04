import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import PolicyController from '@api/controllers/policy'

describe.only('Integ: CapitalFlow Installation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('should install capital flow plugin correctly', async function () {
    this.timeout(1000000000)
    const daoAddress = '0x63d2796a2707F20c75a1348759Bb53e56f01D054'
    const network = NetworksEnum.ethereumSepolia

    const libUtil = new LibUtils({
      daoAddress,
      network,
      config: {
        sandbox,
      },
    })

    await libUtil.syncCompleteDao(9521883)

    const policies = await PolicyController.getPoliciesByDao({ daoAddress, network })

    expect(policies).to.be.an('array')
    expect(policies.length).to.be.greaterThan(0)

    // Verify policy structure
    for (const policy of policies) {
      expect(policy).to.have.property('address')
      expect(policy).to.have.property('interfaceType')
      expect(policy).to.have.property('strategy')

      // Verify strategy structure
      expect(policy.strategy).to.have.property('type')
      expect(policy.strategy).to.have.property('model')
      expect(policy.strategy).to.have.property('source')

      if (policy.strategy.model) {
        expect(policy.strategy.model).to.have.property('type')
        expect(policy.strategy.model).to.have.property('address')
      }

      if (policy.strategy.source) {
        expect(policy.strategy.source).to.have.property('type')
        expect(policy.strategy.source).to.have.property('address')
      }
    }

    // Check against a database directly
    const pluginsFromDb = await Models.Plugin.find({
      daoAddress,
      network,
      isPolicy: true,
    })

    expect(policies.length).to.equal(pluginsFromDb.length)

    // Verify each policy matches a plugin in DB
    for (const policy of policies) {
      const matchingPlugin = pluginsFromDb.find(p => p.address === policy.address)
      expect(matchingPlugin).to.not.be.undefined
      expect(matchingPlugin!.interfaceType).to.equal(policy.interfaceType)
    }
  })

  it('should install capital flow plugin correctly from tx hash', async function () {
    this.timeout(1000000000)

    await Models.Dao.create({
      id: 'ethereum-sepolia-0x63d2796a2707F20c75a1348759Bb53e56f01D054',
      isActive: true,
      isHidden: false,
      network: 'ethereum-sepolia',
      transactionHash: '0x03365264c884b4a69b992a0a24eed4882390ac51eb14fe5663d6422ea23c1b93',
      blockNumber: 9521883,
      blockTimestamp: 1761815952,
      address: '0x63d2796a2707F20c75a1348759Bb53e56f01D054',
      implementationAddress: '0x824d4AAD1cbF2327c4C429E3c97F968Ee19344F8',
      creatorAddress: '0x8BE3bAa64A6f96957C7035dc96A3a15E71d0f82e',
      ens: null,
      subdomain: null,
      metadataIpfs: 'ipfs://QmVHSC65a2UtK7nt6DVkozEvueNdAuUfdtEEPByAArVnZb',
      name: 'Gauges 5W Demo',
      description: null,
      avatar: null,
      version: '1.4.0',
      metrics: {
        tvlUSD: 0,
        proposalsCreated: 15,
        proposalsExecuted: 10,
        uniqueVoters: 2,
        votes: 11,
        members: 8,
      },
      links: [],
    })

    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x63d2796a2707F20c75a1348759Bb53e56f01D054'
    const txHashesForDrainBalance = [
      '0xae6593beb854fbf87e024e2cbcdc1d63b68bdd584b33772eac414faf33d4b329',
      '0x96a0ce123c8dcf69844b2ef5aa506de481cfacd083dab81770b76c7b87890665',
    ]
    const txHashesForStreamingBalance = [
      '0xea75d7dc78064ccfbe001a2a7aed9d68a6976a1cd9783e91e0dc3c9c977908aa',
      '0x15d381c33070ca7257019f6d61d01ca76b001e1b34b2e4f90a98e2875a33387b',
    ]

    const txHashesForBurnBalance = [
      '0x79e93920c38f2d94554122b4d4c9863d9544f3ea204e8ddafa75e99c4978ba10',
      '0x51cb8f01c85cca2c68974e8ccab75c8686b3f0f4d3680999e176c1e248103476',
    ]

    const libUtil = new LibUtils({
      daoAddress,
      network,
      config: {
        sandbox,
      },
    })

    await libUtil.stubRabbitmqSend()

    await LibUtils.handleEventsFromTxHashes(txHashesForStreamingBalance, network)

    sandbox.restore()
    await libUtil.stubRabbitmqSend()

    await LibUtils.handleEventsFromTxHashes(txHashesForDrainBalance, network)
    sandbox.restore()

    await libUtil.stubRabbitmqSend()
    await LibUtils.handleEventsFromTxHashes(txHashesForBurnBalance, network)
  })
})
