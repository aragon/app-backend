import type { IFraudPermissionOp, IFraudRawAction, IFraudTransfer } from '@types'
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
