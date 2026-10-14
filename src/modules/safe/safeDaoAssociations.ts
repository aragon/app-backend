import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { IPermission } from '@src/types/permission'
import {
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  type NetworksEnum,
} from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeDaoAssociations' })
export const EXECUTE_PERMISSION_ID = ethers.id(IPermission.EXECUTE_PERMISSION)

export type ReconcileRef = Pick<ILogInfo, 'blockNumber' | 'transactionHash' | 'transactionIndex' | 'logIndex'>

/** One Plugin row per DAO and Safe: a body of the DAO SPP settings, a process holding execute, or both. */
const SafeDaoAssociationsModule = {
  /** Never throws: counts the rows it could not write. Condition fields on a live process row belong to updateConditionAddress. */
  async reconcileDao(
    daoAddress: HexAddress,
    network: NetworksEnum,
    ref: ReconcileRef,
    executeEvent?: { safeAddress: HexAddress; event: IEventLogPermission },
  ): Promise<{ changed: number; failed: number }> {
    const result = { changed: 0, failed: 0 }
    try {
      if (!(await Models.Dao.findByAddress(daoAddress, network))) return result

      const candidates = await SafeDaoAssociationsModule._candidates(daoAddress, network, ref, executeEvent)
      for (const [safeAddress, { isBody, isProcess, row }] of candidates) {
        if (!row && !isBody && !isProcess) continue
        let outcome: { changed: number; failed: number }
        if (isBody || isProcess) {
          outcome = await SafeDaoAssociationsModule._activate(
            safeAddress,
            daoAddress,
            network,
            ref,
            { isBody, isProcess },
            row,
          )
        } else {
          outcome = await SafeDaoAssociationsModule._retire(row!, ref)
        }
        result.changed += outcome.changed
        result.failed += outcome.failed
      }
    } catch (error) {
      result.failed++
      logger.error('Unable to read Safe associations', llo({ daoAddress, network, error }))
    }
    return result
  },

  async _candidates(
    daoAddress: HexAddress,
    network: NetworksEnum,
    ref: ReconcileRef,
    executeEvent?: { safeAddress: HexAddress; event: IEventLogPermission },
  ): Promise<Map<HexAddress, { isBody: boolean; isProcess: boolean; row: Plugin | null }>> {
    const candidates = new Map<HexAddress, { isBody: boolean; isProcess: boolean; row: Plugin | null }>()
    const bodies = await SafeBodyMembersModule.bodySafeAddresses(daoAddress, network)
    for (const address of bodies)
      candidates.set(ethers.getAddress(address), { isBody: true, isProcess: false, row: null })
    for (const row of await Models.Plugin.findSafeAssociations({ daoAddress, network })) {
      const address = ethers.getAddress(row.address)
      candidates.set(address, { isBody: candidates.has(address), isProcess: false, row })
    }
    const events = await Models.DaoPermission.findLatestExecuteEvents({
      daoAddress,
      network,
      permissionId: EXECUTE_PERMISSION_ID,
    })
    for (const event of events) {
      const address = ethers.getAddress(event.whoAddress)
      const candidate = candidates.get(address)
      if (candidate) candidate.isProcess = event.event === IEventLogPermission.Granted
      else if (event.event === IEventLogPermission.Granted) {
        candidates.set(address, { isBody: false, isProcess: true, row: null })
      }
    }
    if (executeEvent) {
      const address = ethers.getAddress(executeEvent.safeAddress)
      const latest = events.find(event => ethers.getAddress(event.whoAddress) === address)
      if (
        !latest ||
        ref.blockNumber > latest.blockNumber ||
        (ref.blockNumber === latest.blockNumber && ref.transactionIndex > latest.transactionIndex) ||
        (ref.blockNumber === latest.blockNumber &&
          ref.transactionIndex === latest.transactionIndex &&
          ref.logIndex > latest.logIndex)
      ) {
        const candidate = candidates.get(address) ?? { isBody: false, isProcess: false, row: null }
        candidate.isProcess = executeEvent.event === IEventLogPermission.Granted
        candidates.set(address, candidate)
      }
    }
    return candidates
  },

  async _activate(
    safeAddress: HexAddress,
    daoAddress: HexAddress,
    network: NetworksEnum,
    ref: ReconcileRef,
    flags: { isBody: boolean; isProcess: boolean },
    row: Plugin | null,
  ): Promise<{ changed: number; failed: number }> {
    const result = { changed: 0, failed: 0 }
    try {
      const update: Record<string, unknown> = {
        status: IPluginStatus.installed,
        isBody: flags.isBody,
        isProcess: flags.isProcess,
        isSubPlugin: false,
        parentPlugin: null,
        stageIndex: null,
      }
      if (!flags.isProcess) {
        update.conditionAddress = null
        update.conditionInterfaceType = null
      }
      if (row) {
        for (const key of Object.keys(update)) {
          if (row[key] === update[key]) delete update[key]
        }
        if (row.uninstalled.status !== false) update.uninstalled = { status: false }
        if (Object.keys(update).length) {
          row = await DbOperations.updateDocument(
            row,
            update,
            { logId: row.id, ref },
            'Reconcile Safe association',
            llo,
          )
          if (!row) throw new Error('Unable to update Safe association')
          result.changed++
        }
      } else {
        const existing = await Models.Plugin.findOneByDao({ address: safeAddress, daoAddress, network })
        if (existing && existing.interfaceType !== IPluginInterfaceType.safe) return result
        if (!flags.isBody && !(await SafeChainReaderModule.isSafe(network, safeAddress))) return result
        row = await DbOperations.createDocument(
          Models.Plugin,
          {
            ...update,
            id: `${network}-${ref.transactionHash}-${safeAddress}-${daoAddress}`,
            network,
            address: safeAddress,
            daoAddress,
            interfaceType: IPluginInterfaceType.safe,
            isSupported: true,
            uninstalled: { status: false },
            blockNumber: ref.blockNumber,
            transactionHash: ref.transactionHash,
            blockTimestamp: (await Web3Helper.getBlockTimestamp(ref.blockNumber, network)) || undefined,
          },
          ref,
          'New Safe association',
          llo,
        )
        if (!row) throw new Error('Unable to create Safe association')
        result.changed++
      }
      if (!(await PluginSlug.generateSlug(row))) throw new Error('Unable to create Safe slug')
    } catch (error) {
      result.failed++
      logger.error('Unable to activate Safe association', llo({ safeAddress, daoAddress, network, error }))
    }
    return result
  },

  async _retire(row: Plugin, ref: ReconcileRef): Promise<{ changed: number; failed: number }> {
    const result = { changed: 0, failed: 0 }
    const { address: safeAddress, daoAddress, network } = row
    try {
      if (
        row.status !== IPluginStatus.uninstalled ||
        row.isBody !== false ||
        row.isProcess !== false ||
        row.conditionAddress !== null ||
        row.conditionInterfaceType !== null ||
        row.uninstalled.status !== true
      ) {
        const retired = await DbOperations.updateDocument(
          row,
          {
            status: IPluginStatus.uninstalled,
            isBody: false,
            isProcess: false,
            conditionAddress: null,
            conditionInterfaceType: null,
            uninstalled: { status: true, transactionHash: ref.transactionHash, blockNumber: ref.blockNumber },
          },
          { logId: row.id, ref },
          'Retire Safe association',
          llo,
        )
        if (!retired) throw new Error('Unable to retire Safe association')
        row = retired
        result.changed++
      }
      if (await Models.PluginSlug.findPluginSlug(safeAddress, daoAddress, network)) {
        if (!(await PluginSlug.deleteSlug(row))) throw new Error('Unable to delete Safe slug')
      }
    } catch (error) {
      result.failed++
      logger.error('Unable to retire Safe association', llo({ safeAddress, daoAddress, network, error }))
    }
    return result
  },
}

export default SafeDaoAssociationsModule
