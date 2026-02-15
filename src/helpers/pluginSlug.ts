import { Models } from '@dbModels'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type PluginSlugModel from '@models/schema/pluginSlug'
import DbTx from '@modules/dbTx'
import { IPluginInterfaceType, IPluginSlug } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:PluginSlug' })

export const PluginSlug = {
  /**
   * Determines the default slug based on the plugin's interface type.
   * @param plugin - The plugin instance.
   * @returns The default slug as a string or null if the interface type is unrecognized.
   */
  _defaultSlug: (plugin: Plugin): IPluginSlug | null => {
    switch (plugin.interfaceType) {
      case IPluginInterfaceType.spp:
        return IPluginSlug.spp
      case IPluginInterfaceType.lockToVote:
        return IPluginSlug.locktovote
      case IPluginInterfaceType.tokenVoting:
        return IPluginSlug.tokenvoting
      case IPluginInterfaceType.multisig:
        return IPluginSlug.multisig
      case IPluginInterfaceType.admin:
        return IPluginSlug.admin
      case IPluginInterfaceType.gauge:
        return IPluginSlug.gauge
      case IPluginInterfaceType.capitalDistributor:
        return IPluginSlug.capitalDistributor
      case IPluginInterfaceType.router:
        return IPluginSlug.router
      case IPluginInterfaceType.claimer:
        return IPluginSlug.claimer
      default:
        return null
    }
  },

  /**
   * Parses and sanitizes the processKey.
   * @param plugin - The plugin instance.
   * @param processKey - The process key to parse.
   * @returns The sanitized process key as a string or null if invalid.
   */
  _parseProcessKey: (plugin: Plugin, processKey?: string): string | null => {
    try {
      return processKey
        ? processKey
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '') // Remove non-alphanumeric characters
        : PluginSlug._defaultSlug(plugin)
    } catch (error) {
      logger.error('Error parsing processKey', llo({ processKey, error }))
      return null
    }
  },

  /**
   * Attempts to create a PluginSlug document within a transaction.
   * Handles duplicate key errors by appending an incrementing suffix.
   * @param baseKey - The base slug to start with.
   * @param plugin - The plugin instance.
   * @param maxRetries - Maximum number of suffix increments before failing.
   * @returns A unique slug as a string or null if failed.
   */
  _createSlugWithRetries: async (baseKey: string, plugin: Plugin, maxRetries = 300): Promise<string | null> => {
    let candidateKey = baseKey
    let suffix = 0

    while (suffix < maxRetries) {
      try {
        return await DbTx.executeTxFn(
          async ({ session }) => {
            const existing = await Models.PluginSlug.findPluginSlug(plugin.address, plugin.daoAddress, plugin.network, {
              session,
            })
            if (existing) {
              return existing.slug
            }
            const document = {
              network: plugin.network,
              daoAddress: plugin.daoAddress,
              pluginAddress: plugin.address,
              slug: candidateKey,
            }

            await Models.PluginSlug.create(document, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('Created new document - New PluginSlug', llo({ slug: candidateKey }))
            return candidateKey
          },
          { stopRetry: true, throwOnStop: true },
        )
      } catch (error: any) {
        if (error.code === 11000) {
          // Duplicate key error, slug already exists within DAO and network
          suffix += 1
          candidateKey = `${baseKey}_${suffix}`
          logger.warn('Slug already exists, incrementing suffix', llo({ candidateKey, suffix }))
        } else if (error.code === 112) {
          // concurrency error conflicts skip and retry
          logger.warn('Encountered error code 112, skipping', llo({ error }))
        } else {
          // Other errors
          logger.error('Error generating unique slug', llo({ candidateKey, error }))
          return null
        }
      }
    }

    // If maxRetries exceeded, return null
    logger.error(
      'Failed to generate unique slug after maximum retries',
      llo({ candidateKey, pluginAddress: plugin.address }),
    )
    return null
  },

  /**
   * Attempts to update a PluginSlug document within a transaction.
   * Handles duplicate key errors by appending an incrementing suffix.
   * @param newKey - The desired new slug.
   * @param plugin - The plugin instance.
   * @param pluginSlug - The existing PluginSlug document.
   * @param maxRetries - Maximum number of suffix increments before failing.
   * @returns A unique slug as a string or null if failed.
   */
  _updateSlugWithRetries: async (
    newKey: string,
    plugin: Plugin,
    pluginSlug: PluginSlugModel,
    maxRetries = 20,
  ): Promise<string | null> => {
    let candidateKey = newKey
    let suffix = 0

    while (suffix < maxRetries) {
      try {
        await DbTx.executeTxFn(
          async ({ session }) => {
            await pluginSlug.update({ slug: candidateKey }, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('Updated document - Update PluginSlug', llo({ slug: candidateKey }))
          },
          { stopRetry: true, throwOnStop: true },
        )

        return candidateKey
      } catch (error: any) {
        if (error.code === 11000) {
          // Duplicate key error, slug already exists within DAO and network
          suffix += 1
          candidateKey = `${newKey}_${suffix}`
          logger.info('Slug already exists during update, incrementing suffix', llo({ candidateKey, suffix }))
        } else if (error.code === 112) {
          // concurrency error conflicts just retry
          // skip
          logger.warn('Encountered error code 112, skipping', llo({ error }))
        } else {
          // Other errors
          logger.error('Error updating slug', llo({ candidateKey, error }))
          return null
        }
      }
    }

    // If maxRetries exceeded, return null
    logger.error('Failed to update slug after maximum retries', llo({ candidateKey, plugin }))
    return null
  },

  /**
   * Generates a unique slug for the plugin.
   * - If `processKey` is provided, attempts to use it or appends an index if it exists.
   * - If `processKey` is not provided, uses the default slug based on the plugin's interface type.
   * @param plugin - The plugin instance.
   * @param processKey - An optional parameterized slug.
   * @returns A unique slug as a string or null if the plugin is unsupported.
   */
  generateSlug: async (plugin: Plugin, processKey?: string): Promise<string | null> => {
    const parsedProcessKey = PluginSlug._parseProcessKey(plugin, processKey)

    const existing = await Models.PluginSlug.findPluginSlug(plugin.address, plugin.daoAddress, plugin.network)
    if (existing) {
      return existing.slug
    }

    if (!parsedProcessKey) {
      const defaultSlug = PluginSlug._defaultSlug(plugin)
      if (!defaultSlug) {
        // Plugin not supported
        return null
      }

      // Attempt to create a PluginSlug with the default slug
      try {
        return await PluginSlug._createSlugWithRetries(defaultSlug, plugin)
      } catch (error) {
        logger.error('Error reserving default slug', llo({ defaultSlug, error }))
        return null
      }
    } else {
      // Attempt to create a PluginSlug with the provided processKey
      try {
        return await PluginSlug._createSlugWithRetries(parsedProcessKey, plugin)
      } catch (error) {
        logger.error('Error reserving parameterized slug', llo({ parsedProcessKey, error }))
        return null
      }
    }
  },

  /**
   * Deletes a PluginSlug based on daoAddress, pluginAddress, network, and slug.
   * @param plugin - The plugin from db.
   * @returns A boolean indicating whether the deletion was successful.
   */
  deleteSlug: async (plugin: Plugin): Promise<boolean> => {
    try {
      return await Models.PluginSlug.deletePluginSlug(plugin.daoAddress, plugin.address, plugin.network)
    } catch (error: any) {
      logger.error('Error deleting PluginSlug', llo({ plugin, error }))
      return false
    }
  },

  /**
   * Updates the slug of a PluginSlug document.
   * @param plugin - The plugin instance.
   * @param processKey - The new process key.
   * @returns A boolean indicating whether the update was successful or null if not found.
   */
  updateSlug: async (plugin: Plugin, processKey?: string): Promise<string | null> => {
    const parsedProcessKey = PluginSlug._parseProcessKey(plugin, processKey)
    if (!parsedProcessKey) {
      return null
    }
    const pluginSlug = await Models.PluginSlug.findPluginSlug(plugin.address, plugin.daoAddress, plugin.network)

    if (!pluginSlug) {
      logger.error('Plugin slug not found', llo({ plugin }))
      return null
    }

    if (pluginSlug.slug !== parsedProcessKey) {
      try {
        return await PluginSlug._updateSlugWithRetries(parsedProcessKey, plugin, pluginSlug)
      } catch (error) {
        logger.error('Error update slug', llo({ plugin, pluginSlug, parsedProcessKey, error }))
        return null
      }
    }
    return parsedProcessKey
  },
}
