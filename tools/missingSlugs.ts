import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import { EnumConnection, IPluginStatus, type IService, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: MissingSlugs' })

interface IAffectedPlugin {
  id: string
  address: string
  daoAddress: string
  network: NetworksEnum
  interfaceType: string
  processKey: string | null
}

const slugKey = (network: string, daoAddress: string, address: string) => `${network}|${daoAddress}|${address}`

/**
 * Installed plugins that no PluginSlug row points at. The endpoints serve every installed row
 * regardless of isSupported, so all of them need a slug.
 *
 * PluginSlug holds one small row per plugin, so both sides are pulled once and diffed in memory. A
 * $lookup with a sub-pipeline runs once per input document and costs seconds for the same answer.
 */
const findAffected = async (network?: NetworksEnum): Promise<IAffectedPlugin[]> => {
  const scope: any = {}
  if (network) {
    scope.network = network
  }

  const slugRows = await Models.PluginSlug.find(scope, { pluginAddress: 1, daoAddress: 1, network: 1 }).lean()
  const taken = new Set(slugRows.map(row => slugKey(row.network, row.daoAddress, row.pluginAddress)))

  const installed = await Models.Plugin.find(
    { ...scope, status: IPluginStatus.installed },
    { id: 1, address: 1, daoAddress: 1, network: 1, interfaceType: 1, processKey: 1 },
  ).lean()

  return installed.filter(
    plugin => !taken.has(slugKey(plugin.network, plugin.daoAddress, plugin.address)),
  ) as unknown as IAffectedPlugin[]
}

/**
 * An update starts a fresh plugin row that inherits no metadata, so the processKey that named the
 * original slug can still be sitting on the row it replaced. Without this the plugin silently falls
 * back to its default slug and its public url changes.
 */
const recoverProcessKeys = async (plugins: IAffectedPlugin[]): Promise<Map<string, string>> => {
  const recovered = new Map<string, string>()
  const missing = plugins.filter(plugin => !plugin.processKey)

  if (!missing.length) return recovered

  // an $in on the indexed address narrows it enough, the exact row is picked out of the map below
  const siblings = await Models.Plugin.find(
    {
      address: { $in: [...new Set(missing.map(plugin => plugin.address))] },
      processKey: { $ne: null },
    },
    { address: 1, daoAddress: 1, network: 1, processKey: 1, blockNumber: 1 },
  )
    .sort({ blockNumber: 1 })
    .lean()

  // ascending, so the newest row carrying a processKey is the one left in the map
  siblings.forEach(sibling => {
    recovered.set(slugKey(sibling.network, sibling.daoAddress, sibling.address), sibling.processKey!)
  })

  return recovered
}

const tally = (rows: IAffectedPlugin[]) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.network}|${row.interfaceType}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

export const MissingSlugs: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    const execute = process.env.EXECUTE === 'true'
    const targetNetwork = process.env.TARGET_NETWORK as NetworksEnum | undefined

    const affected = await findAffected(targetNetwork)
    const recovered = await recoverProcessKeys(affected)

    const planned: { plugin: IAffectedPlugin; processKey: string | null }[] = []
    const unsupported: IAffectedPlugin[] = []

    affected.forEach(plugin => {
      const processKey = plugin.processKey ?? recovered.get(slugKey(plugin.network, plugin.daoAddress, plugin.address))
      const slug = PluginSlug._parseProcessKey(plugin as any, processKey ?? undefined)

      if (!slug) {
        // no processKey and no default slug for the interfaceType, so nothing can be generated
        unsupported.push(plugin)
        return
      }

      logger.info(
        execute ? 'Generating slug' : 'Would generate slug',
        llo({
          network: plugin.network,
          daoAddress: plugin.daoAddress,
          address: plugin.address,
          interfaceType: plugin.interfaceType,
          recoveredProcessKey: plugin.processKey ? undefined : processKey,
          slug,
        }),
      )

      planned.push({ plugin, processKey: processKey ?? null })
    })

    logger.info(
      'MissingSlugs scan',
      llo({
        slugless: affected.length,
        fixable: planned.length,
        unsupported: unsupported.length,
        unsupportedBy: tally(unsupported),
        execute,
      }),
    )

    if (!execute) {
      logger.info('MissingSlugs dry run, set EXECUTE=true to apply', llo({ fixable: planned.length }))
      return
    }

    let created = 0
    for (const { plugin, processKey } of planned) {
      const slug = await PluginSlug.generateSlug(plugin as any, processKey ?? undefined)
      if (slug) {
        created += 1
      } else {
        logger.error('Failed to generate slug', llo({ address: plugin.address, network: plugin.network }))
      }
    }

    logger.info('MissingSlugs End', llo({ scanned: affected.length, created }))
  },

  stop: async () => {},
}

export default MissingSlugs
