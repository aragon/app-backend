import { FRAUD_IFACE, SEL } from '@modules/fraudDetection/constants'
import { decodeAction, extractMints, extractPermissionOps, extractTransfers } from '@modules/fraudDetection/decode'
import { expect } from 'chai'
import { id as keccakId } from 'ethers'

const TOKEN = '0x1111111111111111111111111111111111111111'
const DAO = '0x3333333333333333333333333333333333333333'
const ATTACKER = '0x9999999999999999999999999999999999999999'
const RECIPIENT = '0x2222222222222222222222222222222222222222'

const MINT_PERMISSION = keccakId('MINT_PERMISSION')
const ROOT_PERMISSION = keccakId('ROOT_PERMISSION')
const SET_METADATA_PERMISSION = keccakId('SET_METADATA_PERMISSION')

describe('Module: fraudDetection/decode', () => {
  describe('selector drift', () => {
    it('derives the same selectors that were observed on-chain in the real attacks', () => {
      expect(SEL.transfer).to.equal('0xa9059cbb')
      expect(SEL.transferFrom).to.equal('0x23b872dd')
      expect(SEL.mint).to.equal('0x40c10f19')
      expect(SEL.grant).to.equal('0xd68bad2c')
      expect(SEL.applySingleTargetPermissions).to.equal('0x22844d04')
      expect(SEL.applyMultiTargetPermissions).to.equal('0xe978afe5')
    })
  })

  describe('decodeAction', () => {
    it('decodes a transfer call', () => {
      const data = FRAUD_IFACE.encodeFunctionData('transfer', [RECIPIENT, 1000n])
      const decoded = decodeAction({ to: TOKEN, data })

      expect(decoded?.name).to.equal('transfer')
      expect(decoded?.args.to).to.equal(RECIPIENT)
      expect(String(decoded?.args.amount)).to.equal('1000')
    })

    it('returns null when the action carries no calldata', () => {
      expect(decodeAction({ to: TOKEN, data: '0x' })).to.equal(null)
      expect(decodeAction({ to: TOKEN, data: null })).to.equal(null)
      expect(decodeAction({ to: TOKEN })).to.equal(null)
    })

    it('returns null for a selector the detector does not know', () => {
      expect(decodeAction({ to: TOKEN, data: '0xdeadbeef0000000000000000000000000000000000000000' })).to.equal(null)
    })
  })

  describe('extractPermissionOps', () => {
    it('flags a MINT_PERMISSION grant as dangerous and names it', () => {
      const data = FRAUD_IFACE.encodeFunctionData('grant', [TOKEN, ATTACKER, MINT_PERMISSION])
      const ops = extractPermissionOps([{ to: DAO, data }])

      expect(ops).to.have.length(1)
      expect(ops[0].operation).to.equal('Grant')
      expect(ops[0].where).to.equal(TOKEN)
      expect(ops[0].who).to.equal(ATTACKER)
      expect(ops[0].permissionName).to.equal('MINT_PERMISSION')
      expect(ops[0].dangerous).to.equal(true)
    })

    it('marks a revoke as Revoke and keeps the dangerous flag on the permission itself', () => {
      const data = FRAUD_IFACE.encodeFunctionData('revoke', [TOKEN, ATTACKER, MINT_PERMISSION])
      const ops = extractPermissionOps([{ to: DAO, data }])

      expect(ops[0].operation).to.equal('Revoke')
      expect(ops[0].dangerous).to.equal(true)
    })

    it('unrolls applySingleTargetPermissions items against the single target', () => {
      const data = FRAUD_IFACE.encodeFunctionData('applySingleTargetPermissions', [
        DAO,
        [
          { operation: 0, who: ATTACKER, permissionId: ROOT_PERMISSION },
          { operation: 1, who: RECIPIENT, permissionId: SET_METADATA_PERMISSION },
        ],
      ])
      const ops = extractPermissionOps([{ to: DAO, data }])

      expect(ops).to.have.length(2)
      expect(ops[0]).to.include({ operation: 'Grant', where: DAO, who: ATTACKER, dangerous: true })
      expect(ops[0].permissionName).to.equal('ROOT_PERMISSION')
      expect(ops[1]).to.include({ operation: 'Revoke', where: DAO, who: RECIPIENT, dangerous: false })
      expect(ops[1].permissionName).to.equal('SET_METADATA_PERMISSION')
    })

    it('unrolls applyMultiTargetPermissions items with their own targets', () => {
      const data = FRAUD_IFACE.encodeFunctionData('applyMultiTargetPermissions', [
        [
          {
            operation: 2,
            where: TOKEN,
            who: ATTACKER,
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: MINT_PERMISSION,
          },
        ],
      ])
      const ops = extractPermissionOps([{ to: DAO, data }])

      expect(ops).to.have.length(1)
      expect(ops[0]).to.include({ operation: 'GrantWithCondition', where: TOKEN, who: ATTACKER, dangerous: true })
    })

    it('labels a permission id it has no name for as unknown', () => {
      const data = FRAUD_IFACE.encodeFunctionData('grant', [TOKEN, ATTACKER, keccakId('SOME_OTHER_PERMISSION')])
      const ops = extractPermissionOps([{ to: DAO, data }])

      expect(ops[0].permissionName).to.equal('unknown')
      expect(ops[0].dangerous).to.equal(false)
    })
  })

  describe('extractTransfers', () => {
    it('reads token, recipient and amount from transfer and transferFrom', () => {
      const transferData = FRAUD_IFACE.encodeFunctionData('transfer', [RECIPIENT, 500n])
      const transferFromData = FRAUD_IFACE.encodeFunctionData('transferFrom', [DAO, ATTACKER, 900n])
      const transfers = extractTransfers([
        { to: TOKEN, data: transferData },
        { to: TOKEN, data: transferFromData },
      ])

      expect(transfers).to.deep.equal([
        { token: TOKEN, to: RECIPIENT, amount: '500' },
        { token: TOKEN, to: ATTACKER, amount: '900' },
      ])
    })

    it('reads the mint recipient and amount from a mint call', () => {
      const data = FRAUD_IFACE.encodeFunctionData('mint', [ATTACKER, 777n])
      expect(extractMints([{ to: TOKEN, data }])).to.deep.equal([{ token: TOKEN, to: ATTACKER, amount: '777' }])
      expect(extractTransfers([{ to: TOKEN, data }])).to.deep.equal([])
    })

    it('ignores actions that are not token transfers', () => {
      const data = FRAUD_IFACE.encodeFunctionData('grant', [TOKEN, ATTACKER, MINT_PERMISSION])
      expect(
        extractTransfers([
          { to: DAO, data },
          { to: DAO, data: '0x' },
        ]),
      ).to.deep.equal([])
    })
  })
})
