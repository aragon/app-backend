import type { IFraudPermissionOp, IFraudRawAction, IFraudTransfer, IFraudUpgrade } from '@types'
import { getAddress } from 'ethers'
import { DANGEROUS_PERMISSIONS, FRAUD_IFACE, NAMED_PERMISSIONS, OPERATION } from './constants'

export const decodeAction = (action: IFraudRawAction): { name: string; args: any } | null => {
  const data = action?.data ?? ''
  if (data.length < 10) return null
  try {
    const parsed = FRAUD_IFACE.parseTransaction({ data })
    return parsed ? { name: parsed.name, args: parsed.args } : null
  } catch {
    return null
  }
}

export const extractPermissionOps = (actions: IFraudRawAction[]): IFraudPermissionOp[] => {
  const ops: IFraudPermissionOp[] = []
  for (const action of actions) {
    const decoded = decodeAction(action)
    if (!decoded) continue

    const push = (operation: string, where: string, who: string, permissionId: string) => {
      const normalised = permissionId.toLowerCase()
      ops.push({
        operation,
        where,
        who,
        permissionId,
        permissionName: NAMED_PERMISSIONS[normalised] ?? 'unknown',
        dangerous: DANGEROUS_PERMISSIONS.has(normalised),
      })
    }

    if (decoded.name === 'grant' || decoded.name === 'revoke') {
      push(
        decoded.name === 'grant' ? 'Grant' : 'Revoke',
        decoded.args.where,
        decoded.args.who,
        decoded.args.permissionId,
      )
    } else if (decoded.name === 'applySingleTargetPermissions') {
      for (const item of decoded.args.items) {
        push(
          OPERATION[Number(item.operation)] ?? String(item.operation),
          decoded.args.where,
          item.who,
          item.permissionId,
        )
      }
    } else if (decoded.name === 'applyMultiTargetPermissions') {
      for (const item of decoded.args.items) {
        push(OPERATION[Number(item.operation)] ?? String(item.operation), item.where, item.who, item.permissionId)
      }
    }
  }
  return ops
}

export const extractTransfers = (actions: IFraudRawAction[]): IFraudTransfer[] => {
  const out: IFraudTransfer[] = []
  for (const action of actions) {
    const decoded = decodeAction(action)
    if (!decoded) continue
    if (decoded.name === 'transfer' || decoded.name === 'transferFrom') {
      out.push({ token: action.to, to: decoded.args.to, amount: String(decoded.args.amount) })
    }
  }
  return out
}

export const extractMints = (actions: IFraudRawAction[]): IFraudTransfer[] => {
  const out: IFraudTransfer[] = []
  for (const action of actions) {
    const decoded = decodeAction(action)
    if (decoded?.name === 'mint') {
      out.push({ token: action.to, to: decoded.args.to, amount: String(decoded.args.amount) })
    }
  }
  return out
}

/**
 * The init payload is an arbitrary call into the not-yet-known new implementation, so the
 * arguments cannot be decoded by signature. Every 32-byte word that is a left-padded
 * non-zero address is reported instead: in the observed shape the new controller is one of
 * them, and a word that only looks like an address costs a name in the alert, nothing more.
 */
const addressesInPayload = (initData: string): string[] => {
  const body = initData.slice(10)
  const found: string[] = []
  for (let i = 0; i + 64 <= body.length; i += 64) {
    const word = body.slice(i, i + 64)
    if (word.slice(0, 24) !== '0'.repeat(24)) continue
    const candidate = word.slice(24)
    if (candidate === '0'.repeat(40)) continue
    try {
      found.push(getAddress(`0x${candidate}`))
    } catch {}
  }
  return [...new Set(found)]
}

export const extractUpgrades = (actions: IFraudRawAction[]): IFraudUpgrade[] => {
  const out: IFraudUpgrade[] = []
  for (const action of actions) {
    const decoded = decodeAction(action)
    if (decoded?.name !== 'upgradeTo' && decoded?.name !== 'upgradeToAndCall') continue

    const initData: string = decoded.name === 'upgradeToAndCall' ? decoded.args.data : '0x'
    out.push({
      target: action.to,
      implementation: decoded.args.newImplementation,
      initSelector: initData.length >= 10 ? initData.slice(0, 10) : null,
      initAddresses: initData.length >= 10 ? addressesInPayload(initData) : [],
    })
  }
  return out
}
