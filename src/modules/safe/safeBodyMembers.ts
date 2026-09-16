/**
 * Safe owners as DAO members.
 *
 * A Safe configured as an external body of an SPP process is a plugin on the DAO, so its owners are
 * members of that DAO by the same chain that makes a multisig body's signers members. Nothing on
 * chain announces that relation: the Safe emits owner changes, the SPP emits body configuration,
 * and only this module joins the two.
 *
 * Membership is stored as `PluginMember` rows with `source: safe` and `pluginAddress` set to the
 * Safe. Those rows are event-sourced (`AddedOwner` / `RemovedOwner`) and seeded from
 * `getOwners()` whenever the body set changes, so the index lags chain by the indexer's polling
 * interval and no further. The alternative - reading `getOwners()` at request time - was rejected:
 * `GET /v2/daos/member/:address` and Explore's Member filter are address-wide, so a read-time union
 * would have to call every Safe on every DAO to answer one page.
 */

import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance } from '@src/governance'
import {
  EnumQueueName,
  type HexAddress,
  IPluginMemberSource,
  IPluginStatus,
  ISettingStatus,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyMembers' })

const requestDaoMetrics = async (daoAddress: HexAddress, network: NetworksEnum) =>
  RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
    id: daoAddress,
    params: { address: daoAddress, network },
  })

/**
 * Stage body addresses of every active setting of a DAO whose plugin is still installed,
 * deduplicated. Uses one `distinct` over the plugin set rather than a `findOne` per setting.
 */
const activeBodyAddresses = async (daoAddress: HexAddress, network: NetworksEnum): Promise<HexAddress[]> => {
  const settings = await Models.Setting.find({
    daoAddress,
    network,
    status: ISettingStatus.active,
    'stages.plugins.address': { $ne: null },
  })
  if (!settings.length) return []

  const installed = await Models.Plugin.distinct('address', {
    network,
    address: { $in: settings.map(setting => setting.pluginAddress) },
    status: IPluginStatus.installed,
  })
  const installedSet = new Set<string>(installed)

  const addresses = new Set<HexAddress>()
  for (const setting of settings) {
    // A setting whose plugin is gone confers nothing, so its bodies are not collected.
    if (!installedSet.has(setting.pluginAddress)) continue

    for (const stage of setting.stages ?? []) {
      for (const body of stage.plugins ?? []) {
        if (body.address) addresses.add(body.address)
      }
    }
  }

  return [...addresses]
}

const SafeBodyMembersModule = {
  /**
   * DAOs holding `safeAddress` as a stage body of a still-installed plugin.
   *
   * Drives fan-out: one Safe can be a body on several DAOs, so one owner change is a membership
   * change on all of them.
   */
  async findDaosWithSafeBody(network: NetworksEnum, safeAddress: HexAddress): Promise<HexAddress[]> {
    const settings = await Models.Setting.find({
      network,
      status: ISettingStatus.active,
      'stages.plugins.address': safeAddress,
    })
    if (!settings.length) return []

    const installed = await Models.Plugin.distinct('address', {
      network,
      address: { $in: settings.map(setting => setting.pluginAddress) },
      status: IPluginStatus.installed,
    })
    const installedSet = new Set<string>(installed)

    const daoAddresses = new Set<HexAddress>()
    for (const setting of settings) {
      if (setting.daoAddress && installedSet.has(setting.pluginAddress)) daoAddresses.add(setting.daoAddress)
    }

    return [...daoAddresses]
  },

  /**
   * Owner sets of every configured Safe body of a DAO that answered, keyed by Safe address.
   *
   * A body with a Plugin document is an internal plugin and is skipped without an RPC call; the
   * rest are probed, and `readOwners` returning `null` is the answer "not a Safe" - or a flaky
   * read. The caller keeps `configuredBodies` separately so a `null` answer for a *still
   * configured* body is not mistaken for "this Safe no longer exists".
   */
  async readSafeBodyOwners(
    configuredBodies: HexAddress[],
    network: NetworksEnum,
  ): Promise<Map<HexAddress, HexAddress[]>> {
    const owners = new Map<HexAddress, HexAddress[]>()
    if (!configuredBodies.length) return owners

    const internalPlugins = new Set(
      await Models.Plugin.distinct('address', {
        network,
        address: { $in: configuredBodies },
      }),
    )

    for (const bodyAddress of configuredBodies) {
      if (internalPlugins.has(bodyAddress)) continue

      const safeOwners = await SafeChainReaderModule.readOwners(network, bodyAddress)
      if (safeOwners) owners.set(bodyAddress, safeOwners as HexAddress[])
    }

    return owners
  },

  /**
   * Makes the DAO's Safe-body memberships match chain: adds owners of current Safe bodies, and
   * withdraws rows for owners who left or for bodies that are no longer configured.
   *
   * This is the single retraction path - an uninstalled or replaced body simply stops appearing in
   * the desired set. Memberships from other routes (token holdings, multisig plugins) live in other
   * rows and are untouched.
   *
   * A body that is **still configured** but whose read returned `null` is left alone rather than
   * retracted: a flaky node answering for a real Safe must not read as "this Safe lost every
   * owner". Only a body that answered (its owner set defines the desired rows) or one that is no
   * longer configured (its rows are stale by construction) is withdrawn.
   *
   * Returns the number of rows changed, or `null` when the owner set could not be read and nothing
   * was reconciled. Event handlers treat that as "leave it for the next event"; the backfill
   * migration counts it as a failure, so an outage cannot pass for "nothing to seed".
   */
  async syncDao(daoAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    const configuredBodies = await activeBodyAddresses(daoAddress, network)
    const configuredSet = new Set<string>(configuredBodies)

    let ownersBySafe: Map<HexAddress, HexAddress[]>
    try {
      ownersBySafe = await SafeBodyMembersModule.readSafeBodyOwners(configuredBodies, network)
    } catch (error) {
      // Stale rows beat withdrawing real memberships because an RPC blipped.
      logger.warn('Safe body owners unread, memberships left as they are', llo({ daoAddress, network, error }))
      return null
    }

    const existing = await Models.PluginMember.find({ daoAddress, network, source: IPluginMemberSource.safe })
    const desired = new Set<string>()
    for (const [safeAddress, owners] of ownersBySafe) {
      for (const owner of owners) desired.add(`${safeAddress}-${owner}`)
    }

    let changed = 0

    for (const row of existing) {
      if (desired.has(`${row.pluginAddress}-${row.memberAddress}`)) continue

      // Body answered and the owner is no longer a member: retract. Body still configured but did
      // not answer (flaky node reading as "not a Safe"): keep the stale rows.
      const answered = ownersBySafe.has(row.pluginAddress)
      const stillConfigured = configuredSet.has(row.pluginAddress)
      if (!answered && stillConfigured) continue

      await row.deleteOne()
      changed++
      logger.verbose('Withdrew Safe body membership', llo({ daoAddress, network, id: row.id }))
    }

    const existingKeys = new Set(existing.map(row => `${row.pluginAddress}-${row.memberAddress}`))
    for (const [safeAddress, owners] of ownersBySafe) {
      for (const owner of owners) {
        if (existingKeys.has(`${safeAddress}-${owner}`)) continue
        await SafeBodyMembersModule._createMembership(network, safeAddress, daoAddress, owner)
        changed++
      }
    }

    if (changed) await requestDaoMetrics(daoAddress, network)

    return changed
  },

  /** `AddedOwner`: the owner becomes a member of every DAO holding this Safe as a body. */
  async addOwner(network: NetworksEnum, safeAddress: HexAddress, owner: HexAddress): Promise<number> {
    const daoAddresses = await SafeBodyMembersModule.findDaosWithSafeBody(network, safeAddress)

    for (const daoAddress of daoAddresses) {
      await SafeBodyMembersModule._createMembership(network, safeAddress, daoAddress, owner)
      await requestDaoMetrics(daoAddress, network)
    }

    return daoAddresses.length
  },

  /**
   * `RemovedOwner`: the membership the Safe conferred is withdrawn everywhere.
   *
   * Only rows this Safe conferred are deleted, so a wallet that is also a token holder or a
   * multisig signer keeps those memberships.
   */
  async removeOwner(network: NetworksEnum, safeAddress: HexAddress, owner: HexAddress): Promise<number> {
    const daoAddresses = await SafeBodyMembersModule.findDaosWithSafeBody(network, safeAddress)

    const { deletedCount } = await Models.PluginMember.deleteMany({
      network,
      pluginAddress: safeAddress,
      memberAddress: owner,
      source: IPluginMemberSource.safe,
    })

    if (deletedCount) {
      logger.verbose('Withdrew Safe body membership', llo({ network, safeAddress, owner, deletedCount }))
      for (const daoAddress of daoAddresses) await requestDaoMetrics(daoAddress, network)
    }

    return deletedCount
  },

  async _createMembership(
    network: NetworksEnum,
    safeAddress: HexAddress,
    daoAddress: HexAddress,
    owner: HexAddress,
  ): Promise<void> {
    const existing = await Models.PluginMember.findExistingLog({
      network,
      memberAddress: owner,
      pluginAddress: safeAddress,
      daoAddress,
    })
    if (existing) return

    // The member list joins to `Member` for ens/avatar, so the base document has to exist first.
    await BaseGovernance.ensureBaseMember(owner)

    try {
      await Models.PluginMember.create({
        memberAddress: owner,
        pluginAddress: safeAddress,
        daoAddress,
        network,
        source: IPluginMemberSource.safe,
      })
    } catch (error) {
      // Check-then-create races the unique `id` index: a concurrent `AddedOwner` or a live event
      // landing during the backfill can both see nothing and both insert. A duplicate-key is the
      // other writer winning; treat it as already-exists rather than failing the event/migration.
      if (!DbTx.isErrorDuplicateKey(error)) throw error
      return
    }

    logger.verbose('Granted Safe body membership', llo({ network, safeAddress, daoAddress, owner }))
  },
}

export default SafeBodyMembersModule
