import { FRAUD_IFACE } from '@modules/fraudDetection/constants'
import { levelFor, scoreProposal } from '@modules/fraudDetection/score'
import type { IFraudRiskContext } from '@types'
import { expect } from 'chai'
import { id as keccakId } from 'ethers'

const TOKEN = '0x1111111111111111111111111111111111111111'
const RECIPIENT = '0x2222222222222222222222222222222222222222'
const DAO = '0x3333333333333333333333333333333333333333'
const PLUGIN = '0x4444444444444444444444444444444444444444'
const CREATOR = '0x5555555555555555555555555555555555555555'
const ATTACKER = '0x9999999999999999999999999999999999999999'

const PSP = '0x6666666666666666666666666666666666666666'
const OTHER_PLUGIN = '0x7777777777777777777777777777777777777777'
const FOREIGN_DAO = '0x8888888888888888888888888888888888888888'

const MINT_PERMISSION = keccakId('MINT_PERMISSION')
const ROOT_PERMISSION = keccakId('ROOT_PERMISSION')
const EXECUTE_PERMISSION = keccakId('EXECUTE_PERMISSION')

const transferAction = (to = RECIPIENT, amount = 1000n) => ({
  to: TOKEN,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('transfer', [to, amount]),
})

const grantMintAction = () => ({
  to: DAO,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('grant', [TOKEN, ATTACKER, MINT_PERMISSION]),
})

const revokeMintAction = (who = ATTACKER) => ({
  to: DAO,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('revoke', [TOKEN, who, MINT_PERMISSION]),
})

const revokeRootAction = () => ({
  to: DAO,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('revoke', [TOKEN, ATTACKER, ROOT_PERMISSION]),
})

const mintAction = (to = ATTACKER, amount = 1_000_000n) => ({
  to: TOKEN,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('mint', [to, amount]),
})

const grantAction = (who: string, permission = MINT_PERMISSION) => ({
  to: DAO,
  value: '0',
  data: FRAUD_IFACE.encodeFunctionData('grant', [DAO, who, permission]),
})

const baseContext = (overrides: Partial<IFraudRiskContext> = {}): IFraudRiskContext => ({
  actions: [],
  daoAddress: DAO,
  pluginAddress: PLUGIN,
  creatorAddress: CREATOR,
  title: 'Treasury allocation',
  description: 'Pay the Q3 grant',
  blockTimestamp: 1_800_000_000,
  priorProposals: 0,
  priorVotes: 0,
  isSubPlugin: false,
  daoBlockTimestamp: 1_700_000_000,
  daoAssetCount: 2,
  ...overrides,
})

const signalNames = (assessment: ReturnType<typeof scoreProposal>) => assessment.signals.map(s => s.name)

describe('Module: fraudDetection/score', () => {
  describe('levelFor', () => {
    it('maps scores to the scanner bands', () => {
      expect(levelFor(70)).to.equal('critical')
      expect(levelFor(45)).to.equal('high')
      expect(levelFor(25)).to.equal('medium')
      expect(levelFor(24)).to.equal('low')
    })
  })

  describe('the attack-class gate', () => {
    it('does not match a proposal whose actions neither move value nor touch permissions', () => {
      const assessment = scoreProposal(baseContext({ actions: [{ to: RECIPIENT, value: '0', data: '0xdeadbeef00' }] }))

      expect(assessment.matched).to.equal(false)
      expect(assessment.score).to.equal(0)
      expect(assessment.signals).to.deep.equal([])
    })

    it('matches a plain native-value send even though the calldata decodes to nothing', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [{ to: RECIPIENT, value: '5000000000000000000', data: '0x' }] }),
      )

      expect(assessment.matched).to.equal(true)
      expect(assessment.attackClass).to.deep.equal(['transfer'])
      expect(assessment.nativeValue).to.equal('5000000000000000000')
    })
  })

  describe('creation-time signals', () => {
    it('scores an outsider draining to an outside recipient as high at creation', () => {
      const assessment = scoreProposal(baseContext({ actions: [transferAction()] }))

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'recipientOutsider'])
      expect(assessment.creationScore).to.equal(55)
      expect(assessment.creationLevel).to.equal('high')
    })

    it('scores an outsider granting MINT_PERMISSION as critical at creation', () => {
      const assessment = scoreProposal(baseContext({ actions: [grantMintAction()] }))

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'dangerousPermissionGrant'])
      expect(assessment.creationScore).to.equal(70)
      expect(assessment.creationLevel).to.equal('critical')
      expect(assessment.attackClass).to.deep.equal(['permission'])
    })

    it('detects the grant → mint-to-attacker → revoke sandwich', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [grantMintAction(), mintAction(ATTACKER), revokeMintAction()] }),
      )

      expect(signalNames(assessment)).to.deep.equal([
        'outsiderCreator',
        'containedPermissionGrant',
        'permissionSandwich',
        'recipientOutsider',
      ])
      expect(assessment.creationScore).to.equal(90)
      expect(assessment.creationLevel).to.equal('critical')
      expect(assessment.attackClass).to.deep.equal(['mint', 'permission'])
      expect(assessment.mints).to.deep.equal([{ token: TOKEN, to: ATTACKER, amount: '1000000' }])
    })

    it('keeps a standing dangerous grant at full weight even when another grant is revoked', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [grantMintAction(), mintAction(ATTACKER), revokeRootAction()] }),
      )

      expect(signalNames(assessment)).to.include('dangerousPermissionGrant')
      expect(assessment.creationScore).to.equal(110)
    })

    it('discounts an established creator to below the alert line, matching the retro scanner', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [grantMintAction(), mintAction(ATTACKER), revokeMintAction()],
          priorProposals: 5,
          priorVotes: 7,
        }),
      )

      expect(signalNames(assessment)).to.include('establishedCreator')
      expect(assessment.creationScore).to.equal(15)
      expect(assessment.creationLevel).to.equal('low')
    })

    it('does not flag the recipient when they hold the governance token', () => {
      const assessment = scoreProposal(baseContext({ actions: [transferAction()], tokenHolders: new Set([RECIPIENT]) }))

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator'])
      expect(assessment.creationScore).to.equal(40)
    })

    it('adds the governance-settings signals when the window is easy to rush', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [transferAction(DAO)],
          title: null,
          description: null,
          minParticipation: 0,
          minDuration: 3 * 3600,
        }),
      )

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'zeroQuorum', 'shortWindow', 'noDescription'])
      expect(assessment.creationScore).to.equal(70)
    })

    it('discounts proposals on an SPP sub-plugin, which cannot execute directly', () => {
      const assessment = scoreProposal(baseContext({ actions: [transferAction()], isSubPlugin: true }))

      expect(signalNames(assessment)).to.include('subPluginStage')
      expect(assessment.creationScore).to.equal(35)
      expect(assessment.creationLevel).to.equal('medium')
    })

    it('never returns a negative score', () => {
      const assessment = scoreProposal(baseContext({ actions: [revokeMintAction()], priorProposals: 5, priorVotes: 7 }))

      expect(signalNames(assessment)).to.deep.equal(['establishedCreator', 'permissionChange'])
      expect(assessment.score).to.equal(0)
      expect(assessment.creationScore).to.equal(0)
    })
  })

  describe('beneficiary rules', () => {
    const installSandwich = () => [
      grantAction(PSP, ROOT_PERMISSION),
      { to: PSP, value: '0', data: '0xdeadbeef0000000000000000000000000000000000000000' },
      revokeRootFromPsp(),
    ]
    const revokeRootFromPsp = () => ({
      to: DAO,
      value: '0',
      data: FRAUD_IFACE.encodeFunctionData('revoke', [DAO, PSP, ROOT_PERMISSION]),
    })

    it('scores a plugin install by an established member as zero, without knowing any infra address', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: installSandwich(),
          priorProposals: 5,
          priorVotes: 7,
        }),
      )

      expect(signalNames(assessment)).to.deep.equal(['establishedCreator', 'containedPermissionGrant'])
      expect(assessment.creationScore).to.equal(0)
    })

    it('keeps a plugin install by a brand-new account at high, not critical', () => {
      const assessment = scoreProposal(baseContext({ actions: installSandwich() }))

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'containedPermissionGrant'])
      expect(assessment.creationScore).to.equal(50)
      expect(assessment.creationLevel).to.equal('high')
    })

    it('catches the July drain shape: mint permission granted to the DAO itself, minted to an attacker', () => {
      const actions = [
        grantAction(DAO, MINT_PERMISSION),
        mintAction(ATTACKER),
        {
          to: DAO,
          value: '0',
          data: FRAUD_IFACE.encodeFunctionData('revoke', [DAO, DAO, MINT_PERMISSION]),
        },
      ]
      const assessment = scoreProposal(baseContext({ actions }))

      expect(signalNames(assessment)).to.deep.equal([
        'outsiderCreator',
        'containedPermissionGrant',
        'permissionSandwich',
        'recipientOutsider',
      ])
      expect(assessment.creationScore).to.equal(90)
      expect(assessment.creationLevel).to.equal('critical')
      expect(assessment.attackClass).to.deep.equal(['mint', 'permission'])
    })

    it('does not let a grant to an unrelated DAO in the database pass as system', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [grantAction(FOREIGN_DAO, EXECUTE_PERMISSION)],
          systemAddresses: new Set([OTHER_PLUGIN]),
        }),
      )

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'dangerousPermissionGrant'])
      expect(assessment.creationScore).to.equal(70)
      expect(assessment.creationLevel).to.equal('critical')
    })

    it('does not flag a transfer that funds a plugin of the same DAO', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [transferAction(OTHER_PLUGIN)], systemAddresses: new Set([OTHER_PLUGIN]) }),
      )

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator'])
      expect(assessment.creationScore).to.equal(40)
    })

    it('treats a treasury self-mint by an established member as routine', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [grantAction(DAO, MINT_PERMISSION), mintAction(DAO)],
          priorProposals: 5,
          priorVotes: 7,
        }),
      )

      expect(signalNames(assessment)).to.deep.equal(['establishedCreator', 'containedPermissionGrant'])
      expect(assessment.creationScore).to.equal(0)
    })

    it('does not let a revoke placed before the grant disguise a standing grant', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [revokeMintAction(), mintAction(DAO), grantMintAction()],
        }),
      )

      expect(signalNames(assessment)).to.include('dangerousPermissionGrant')
      expect(assessment.creationScore).to.equal(70)
    })

    it('does not call a revoke → call → grant sequence a sandwich', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [revokeMintAction(), mintAction(ATTACKER), grantMintAction()] }),
      )

      expect(signalNames(assessment)).to.not.include('permissionSandwich')
    })

    it('flags a native send to an outsider recipient', () => {
      const assessment = scoreProposal(
        baseContext({ actions: [{ to: ATTACKER, value: '5000000000000000000', data: '0x' }] }),
      )

      expect(signalNames(assessment)).to.deep.equal(['outsiderCreator', 'recipientOutsider'])
      expect(assessment.creationScore).to.equal(55)
    })
  })

  describe('vote-derived signals', () => {
    it('raises the full score but not the creation score when only the creator has voted', () => {
      const assessment = scoreProposal(baseContext({ actions: [transferAction()], voters: [CREATOR] }))

      expect(signalNames(assessment)).to.include('selfVoteOnly')
      expect(assessment.score).to.equal(80)
      expect(assessment.creationScore).to.equal(55)
    })

    it('does not count a self vote when other members voted too', () => {
      const assessment = scoreProposal(baseContext({ actions: [transferAction()], voters: [CREATOR, RECIPIENT] }))

      expect(signalNames(assessment)).to.not.include('selfVoteOnly')
    })
  })

  describe('daoBootstrap suppression', () => {
    it('suppresses a brand-new DAO wiring itself up', () => {
      const selfGrant = {
        to: DAO,
        value: '0',
        data: FRAUD_IFACE.encodeFunctionData('grant', [DAO, PLUGIN, keccakId('ROOT_PERMISSION')]),
      }
      const assessment = scoreProposal(
        baseContext({
          actions: [selfGrant],
          blockTimestamp: 1_700_000_600,
          daoBlockTimestamp: 1_700_000_000,
          daoAssetCount: 0,
        }),
      )

      expect(assessment.matched).to.equal(true)
      expect(assessment.suppressedAs).to.equal('daoBootstrap')
      expect(assessment.score).to.equal(0)
      expect(assessment.creationScore).to.equal(0)
    })

    it('does not suppress when the young DAO already holds assets', () => {
      const selfGrant = {
        to: DAO,
        value: '0',
        data: FRAUD_IFACE.encodeFunctionData('grant', [DAO, ATTACKER, keccakId('ROOT_PERMISSION')]),
      }
      const assessment = scoreProposal(
        baseContext({
          actions: [selfGrant],
          blockTimestamp: 1_700_000_600,
          daoBlockTimestamp: 1_700_000_000,
          daoAssetCount: 3,
        }),
      )

      expect(assessment.suppressedAs).to.equal(null)
      expect(assessment.creationScore).to.be.greaterThan(0)
    })

    it('does not suppress when any action reaches outside the DAO', () => {
      const assessment = scoreProposal(
        baseContext({
          actions: [transferAction()],
          blockTimestamp: 1_700_000_600,
          daoBlockTimestamp: 1_700_000_000,
          daoAssetCount: 0,
        }),
      )

      expect(assessment.suppressedAs).to.equal(null)
    })
  })
})
