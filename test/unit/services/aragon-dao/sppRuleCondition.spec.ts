import config from '@config'
import ConditionDetector from '@helpers/conditionDetector'
import SppBodyConditionHelper from '@helpers/sppBodyCondition'
import { SppRuleConditionDao } from '@services/aragon-dao/sppRuleCondition'
import { IConditionInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('AragonDao: SppRuleConditionDao', () => {
  const network = NetworksEnum.ethereumSepolia
  const ruleCondition = '0xb28a9D4463c03790eC7CA725eDb7A46b0dB6dAaa'
  const otherCondition = '0x23c4aDb7CE681a785ACbf75841b0312A7014BB98'

  const rules = [
    {
      type: 'logic' as const,
      operation: 'and' as const,
      value: '8589934593',
      permissionId: `0x${'00'.repeat(32)}`,
      ruleIndexes: [1, 2],
    },
  ]

  let sandbox: SinonSandbox
  let detectStub: SinonStub
  let readSppRulesStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    detectStub = sandbox
      .stub(ConditionDetector, 'detect')
      .callsFake(async address => (address === ruleCondition ? IConditionInterfaceType.sppRule : null))
    readSppRulesStub = sandbox.stub(SppBodyConditionHelper, 'readSppRules').resolves(rules)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('resolve', () => {
    it('returns the rules of every address that is an SPP rule condition', async () => {
      const result = await SppRuleConditionDao.resolve({
        sentAt: Date.now(),
        network,
        conditionAddresses: [ruleCondition],
      })

      expect(result).to.deep.equal({ rulesByCondition: { [ruleCondition.toLowerCase()]: rules } })
      expect(readSppRulesStub.calledOnceWithExactly(ruleCondition, network)).to.be.true
    })

    it('leaves out an address that is not a rule condition', async () => {
      const result = await SppRuleConditionDao.resolve({
        sentAt: Date.now(),
        network,
        conditionAddresses: [ruleCondition, otherCondition],
      })

      expect(result.rulesByCondition).to.have.all.keys(ruleCondition.toLowerCase())
      expect(detectStub.callCount).to.equal(2)
      expect(readSppRulesStub.calledOnce).to.be.true
    })

    it('leaves out an address whose rules could not be read and keeps the rest', async () => {
      readSppRulesStub.rejects(new Error('rpc down'))

      const result = await SppRuleConditionDao.resolve({
        sentAt: Date.now(),
        network,
        conditionAddresses: [ruleCondition, otherCondition],
      })

      expect(result).to.deep.equal({ rulesByCondition: {} })
    })

    it('does not read anything when the api already stopped waiting', async () => {
      const result = await SppRuleConditionDao.resolve({
        sentAt: Date.now() - config.RABBITMQ.TIMEOUT - 1,
        network,
        conditionAddresses: [ruleCondition],
      })

      expect(result).to.deep.equal({ rulesByCondition: {} })
      expect(detectStub.called).to.be.false
      expect(readSppRulesStub.called).to.be.false
    })
  })
})
