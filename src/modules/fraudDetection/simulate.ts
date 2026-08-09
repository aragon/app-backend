import { DAO } from '@artifacts/dao'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import {
  type IFraudAssessment,
  type IFraudRawAction,
  type IFraudSimulationStatus,
  ISimulationStatus,
  type NetworksEnum,
} from '@types'
import { Interface, id as keccakId } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'fraud-simulate' })

const daoInterface = new Interface(DAO.abi)

export interface IFraudSimulation {
  status: IFraudSimulationStatus
  shareUrl: string | null
  runAt: number
}

/**
 * Confirms a finding by simulating the proposal exactly as it would execute: the plugin
 * calling dao.execute() with the proposal's actions, and no allowFailureMap, so a success
 * means every decoded action ran.
 *
 * Success alone is not confirmation. A selector can collide with an unrelated function, so
 * for anything that should move value we require the simulation's asset changes to show a
 * matching movement; when they do not, the status is `noEffect` and the alert says so.
 * Tenderly being unavailable degrades to `unconfirmed` — never to a dropped alert.
 */
export const simulateExecution = async (params: {
  actions: IFraudRawAction[]
  assessment: Pick<IFraudAssessment, 'transfers' | 'mints' | 'nativeValue'>
  daoAddress: string
  pluginAddress: string
  proposalId: string
  network: NetworksEnum
}): Promise<IFraudSimulation> => {
  const runAt = Date.now()
  if (!TenderlyModule.isConfigured()) return { status: 'unconfirmed', shareUrl: null, runAt }

  try {
    const actions = params.actions.map(a => ({ to: a.to, value: a.value || '0', data: a.data || '0x' }))
    const data = daoInterface.encodeFunctionData('execute', [keccakId(params.proposalId), actions, 0])
    const result = await TenderlyModule.simulateFull(
      { to: params.daoAddress, from: params.pluginAddress, data },
      params.network,
    )
    if (!result) return { status: 'unconfirmed', shareUrl: null, runAt }

    const shareUrl = result.shareUrl ?? null
    if (result.status !== ISimulationStatus.SUCCESS) return { status: 'reverted', shareUrl, runAt }

    // Permission-only proposals move nothing, so a clean execute is all there is to confirm.
    const expectedRecipients = [
      ...params.assessment.transfers.map(t => t.to),
      ...params.assessment.mints.map(m => m.to),
    ].map(a => a.toLowerCase())
    const expectsValueMove = expectedRecipients.length > 0 || params.assessment.nativeValue != null
    if (!expectsValueMove) return { status: 'confirmed', shareUrl, runAt }

    const movedTo = new Set((result.assetChanges ?? []).map(change => (change.to ?? '').toLowerCase()))
    const moved = expectedRecipients.some(to => movedTo.has(to)) || (movedTo.size > 0 && !expectedRecipients.length)
    if (!moved) {
      logger.info(
        'FraudScan simulation moved nothing we decoded',
        llo({ proposalId: params.proposalId, assetChanges: result.assetChanges?.length ?? 0 }),
      )
      return { status: 'noEffect', shareUrl, runAt }
    }

    return { status: 'confirmed', shareUrl, runAt }
  } catch (error: any) {
    logger.warn('FraudScan simulation failed', llo({ proposalId: params.proposalId, error: error.message }))
    return { status: 'unconfirmed', shareUrl: null, runAt }
  }
}
