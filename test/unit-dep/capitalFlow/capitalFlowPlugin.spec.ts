import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import PolicyController from '@api/controllers/policy'

describe('Integ: CapitalFlow Installation', () => {
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

      // Verify model structure
      expect(policy.strategy.model).to.have.property('type')
      expect(policy.strategy.model).to.have.property('address')

      // Verify source structure
      expect(policy.strategy.source).to.have.property('type')
      expect(policy.strategy.source).to.have.property('address')
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
})
