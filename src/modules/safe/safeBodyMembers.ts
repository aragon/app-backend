import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import { BaseGovernance } from '@governance/baseGovernance'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DbTx from '@modules/dbTx'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { ErrorKeyEnum, type HexAddress, IPluginInterfaceType, type NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { getAddress } from 'ethers'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyMembers' })

type DaoRef = { daoAddress: HexAddress; network: NetworksEnum }

/** Which Safes belong to which DAOs, and the one-time owner seed when a Safe first becomes visible. */
const SafeBodyMembersModule = {
  /** Every Safe of a DAO: the SAFE-brand bodies of its active SPP settings plus its installed Safe processes. */
  async getSafeAddresses(daoAddress: HexAddress, network: NetworksEnum): Promise<HexAddress[]> {
    const addresses = new Set<HexAddress>()
    for (const setting of await SafeBodyMembersModule._activeSafeBodySettings({ daoAddress, network })) {
      for (const stage of setting.stages ?? []) {
        for (const body of stage.plugins ?? []) {
          if (body.address && body.brandId === VotingBodyBrandIdentity.SAFE) addresses.add(body.address)
        }
      }
    }
    const processes = await Models.Plugin.findInstalled({
      network,
      daoAddress,
      interfaceType: IPluginInterfaceType.safe,
    })
    for (const { address } of processes) addresses.add(address)
    return [...addresses]
  },

  /** The SPP plugins this Safe may report to: the ones whose active setting lists it as a stage body. */
  async bodyPluginsOf(safeAddress: HexAddress, network: NetworksEnum): Promise<Set<HexAddress>> {
    const settings = await SafeBodyMembersModule._activeSafeBodySettings({ safeAddresses: [safeAddress], network })
    return new Set(settings.map(setting => setting.pluginAddress))
  },

  /** Every DAO these Safes belong to, as a body or as a process. */
  async findDaosWithSafeBody(safeAddresses: HexAddress[], network: NetworksEnum): Promise<DaoRef[]> {
    if (!safeAddresses.length) return []
    const daos = new Map<string, DaoRef>()
    for (const setting of await SafeBodyMembersModule._activeSafeBodySettings({ safeAddresses, network })) {
      if (setting.daoAddress) daos.set(setting.daoAddress, { daoAddress: setting.daoAddress, network })
    }
    const processes = await Models.Plugin.findInstalled({
      network,
      addresses: safeAddresses,
      interfaceType: IPluginInterfaceType.safe,
    })
    for (const { daoAddress } of processes) {
      if (daoAddress) daos.set(daoAddress, { daoAddress, network })
    }
    return [...daos.values()]
  },

  /** Stored Safe routes answer only for a Safe some DAO lists as a body or a process. */
  async assertTracked(safeAddress: HexAddress, network: NetworksEnum): Promise<void> {
    const daos = await SafeBodyMembersModule.findDaosWithSafeBody([safeAddress], network)
    assertExposable(daos.length > 0, ErrorKeyEnum.notFound, 404)
  },

  /**
   * Seed each newly visible Safe once. Existing global rows deliberately skip the chain snapshot: an
   * owner event may have populated the tuple first, and there is no retry or retraction path here.
   */
  async seedDao(daoAddress: HexAddress, network: NetworksEnum): Promise<void> {
    // Runs inside a plugin handler, so a discovery failure is logged and the metrics ping still goes out.
    let safeAddresses: HexAddress[] = []
    try {
      safeAddresses = await SafeBodyMembersModule.getSafeAddresses(daoAddress, network)
    } catch (error) {
      logger.warn('Unable to discover Safe bodies for seeding', llo({ daoAddress, network, error }))
    }

    // One Safe whose chain read fails must not block the seed of the others.
    for (const safeAddress of safeAddresses) {
      try {
        await SafeBodyMembersModule._seedSafe(network, safeAddress)
      } catch (error) {
        logger.warn('Unable to seed Safe body owners', llo({ daoAddress, network, safeAddress, error }))
      }
    }

    await BaseGovernance.requestDaoMetrics(daoAddress, network)
  },

  async _seedSafe(network: NetworksEnum, safeAddress: HexAddress): Promise<void> {
    if (await Models.SafeMember.exists({ network, safeAddress })) return
    const owners = await SafeChainReaderModule.readOwners(network, safeAddress)
    if (!owners) return

    const uniqueOwners = new Set<HexAddress>(owners.map(owner => getAddress(owner) as HexAddress))

    // One snapshot, all or nothing: a half-written owner set is skipped by every later seed.
    await DbTx.executeTxFn(async ({ session }: { session: ClientSession }) => {
      if (await Models.SafeMember.exists({ network, safeAddress }).session(session)) return
      for (const owner of uniqueOwners) {
        if (!(await BaseGovernance.ensureBaseMember(owner, undefined, session))) {
          throw new Error(`Unable to ensure base member ${owner}`)
        }
        await Models.SafeMember.ensure(network, safeAddress, owner, session)
      }
      await DbTx.safeCommit(session)
    })
  },

  /** Active SPP settings with a SAFE body whose SPP is still installed. */
  async _activeSafeBodySettings(params: {
    network: NetworksEnum
    daoAddress?: HexAddress
    safeAddresses?: HexAddress[]
  }): Promise<Setting[]> {
    const settings = await Models.Setting.findWithSafeBody(params)
    if (!settings.length) return []

    const installed = await Models.Plugin.findInstalled({
      network: params.network,
      addresses: settings.map(setting => setting.pluginAddress),
      interfaceType: IPluginInterfaceType.spp,
    })
    const installedAddresses = new Set(installed.map(plugin => plugin.address))
    return settings.filter(setting => installedAddresses.has(setting.pluginAddress))
  },
}

export default SafeBodyMembersModule
