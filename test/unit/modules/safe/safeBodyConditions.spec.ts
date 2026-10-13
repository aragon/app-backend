import SppBodyConditionHelper from '@helpers/sppBodyCondition'
import logger from '@logger'
import SafeBodyConditionsModule from '@modules/safe/safeBodyConditions'
import { NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: safe/safeBodyConditions', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  describe('attach', () => {
    const network = NetworksEnum.ethereumMainnet
    const sppPlugin = {
      address: '0xplugin',
      proposalCreationConditionAddress: '0xrule-condition',
    } as any

    it('sets Safe body conditions and returns no external proposers', async () => {
      const stages = [
        {
          plugins: [
            { address: '0xSafeBody', brandId: VotingBodyBrandIdentity.SAFE },
            { address: '0xinternal', brandId: VotingBodyBrandIdentity.OTHER },
          ],
        },
      ]

      const resolveStub = sandbox
        .stub(SppBodyConditionHelper, 'resolveSppProposerConditions')
        .resolves(new Map([['0xsafebody', { safeAddress: '0xSafeBody', conditionAddress: '0xsafe-condition' }]]))

      const result = await SafeBodyConditionsModule.attach(sppPlugin, stages, network)

      expect(resolveStub.calledOnceWith('0xrule-condition', network)).to.be.true
      expect((stages[0].plugins[0] as any).proposalCreationConditionAddress).to.equal('0xsafe-condition')
      expect((stages[0].plugins[1] as any).proposalCreationConditionAddress).to.be.undefined
      expect(result).to.deep.equal([])
    })

    it('returns Safes outside the stages as external proposers', async () => {
      const stages = [
        {
          plugins: [{ address: '0xSafeBody', brandId: VotingBodyBrandIdentity.SAFE }],
        },
      ]

      sandbox.stub(SppBodyConditionHelper, 'resolveSppProposerConditions').resolves(
        new Map([
          ['0xsafebody', { safeAddress: '0xSafeBody', conditionAddress: '0xbody-condition' }],
          ['0xorphansafe', { safeAddress: '0xOrphanSafe', conditionAddress: '0xorphan-condition' }],
        ]),
      )

      const result = await SafeBodyConditionsModule.attach(sppPlugin, stages, network)

      expect((stages[0].plugins[0] as any).proposalCreationConditionAddress).to.equal('0xbody-condition')
      expect(result).to.deep.equal([
        { address: '0xOrphanSafe', proposalCreationConditionAddress: '0xorphan-condition' },
      ])
    })

    it('clears unresolved Safe conditions and leaves other bodies alone', async () => {
      const stages = [
        {
          plugins: [
            { address: '0xSafeBody', brandId: VotingBodyBrandIdentity.SAFE },
            { address: '0xExternalBody', brandId: VotingBodyBrandIdentity.OTHER },
          ],
        },
      ]

      sandbox.stub(SppBodyConditionHelper, 'resolveSppProposerConditions').resolves(new Map())

      const result = await SafeBodyConditionsModule.attach(sppPlugin, stages, network)

      expect((stages[0].plugins[0] as any).proposalCreationConditionAddress).to.be.null
      // non-safe bodies are untouched in memory; the schema default persists null for them
      expect((stages[0].plugins[1] as any).proposalCreationConditionAddress).to.be.undefined
      expect(result).to.deep.equal([])
    })

    it('returns undefined and leaves body conditions alone when resolution fails', async () => {
      const stages = [
        {
          plugins: [{ address: '0xSafeBody', brandId: VotingBodyBrandIdentity.SAFE }],
        },
      ]

      sandbox.stub(SppBodyConditionHelper, 'resolveSppProposerConditions').rejects(new Error('rpc down'))
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await SafeBodyConditionsModule.attach(sppPlugin, stages, network)

      expect(loggerStub.calledOnceWith('Failed to attach external body conditions' as any)).to.be.true
      expect(result).to.be.undefined
      expect((stages[0].plugins[0] as any).proposalCreationConditionAddress).to.be.undefined
    })
  })
})
