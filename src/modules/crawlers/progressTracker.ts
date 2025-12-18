import { Models } from '@dbModels'
import logger from '@logger'
import { type IProgressInfo, type IProgressTrackerConfig, type LogServicePattern, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'ProgressTracker' })

/**
 * Manages crawling progress tracking through ConfigIndexer database
 *
 * Responsibilities:
 * - Track last synced block for a service
 * - Mark services as ended
 * - Get starting block for crawling
 * - Persist progress to database
 */
export class ProgressTracker {
  private readonly network: NetworksEnum
  private readonly service: LogServicePattern
  private readonly initialBlock: number

  constructor(config: IProgressTrackerConfig) {
    this.network = config.network
    this.service = config.service
    this.initialBlock = config.initialBlock ?? 0
  }

  /**
   * Get the starting block for crawling
   * Returns lastSync from existing config or initialBlock if no config exists
   */
  async getStartingBlock(): Promise<number> {
    try {
      const existingConfig = await Models.ConfigIndexer.findExistingLog({
        network: this.network,
        service: this.service,
      })

      if (existingConfig) {
        logger.verbose(
          'Found existing progress',
          llo({
            service: 'ProgressTracker',
            network: this.network,
            logService: this.service,
            lastSync: existingConfig.lastSync,
            isEnded: existingConfig.end,
          }),
        )
        return existingConfig.lastSync
      }

      logger.verbose(
        'No existing progress found, using initial block',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          initialBlock: this.initialBlock,
        }),
      )
      return this.initialBlock
    } catch (error) {
      logger.error(
        'Error getting starting block',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          error,
        }),
      )
      throw error
    }
  }

  /**
   * Save current progress (block number)
   * Creates new config if doesn't exist, updates if exists
   * For concurrent updates, always keeps the highest block number
   */
  async saveProgress(blockNumber: number): Promise<void> {
    try {
      // Check if config exists first
      const existingConfig = await Models.ConfigIndexer.findExistingLog({
        network: this.network,
        service: this.service,
      })

      if (existingConfig) {
        // Update the existing config, using $max to keep the highest block number for concurrent updates
        const result = await Models.ConfigIndexer.findOneAndUpdate(
          {
            id: existingConfig.id,
          },
          {
            $max: { lastSync: blockNumber },
          },
          {
            new: true,
          },
        )

        if (result) {
          logger.verbose(
            'Updated progress',
            llo({
              service: 'ProgressTracker',
              network: this.network,
              logService: this.service,
              lastSync: blockNumber,
            }),
          )
        }
      } else {
        // Create new config
        const id = Models.ConfigIndexer.getEntityId({
          network: this.network,
          service: this.service,
        })

        await Models.ConfigIndexer.create({
          id,
          network: this.network,
          service: this.service,
          lastSync: blockNumber,
        })

        logger.verbose(
          'Created new progress entry',
          llo({
            service: 'ProgressTracker',
            network: this.network,
            logService: this.service,
            lastSync: blockNumber,
          }),
        )
      }
    } catch (error) {
      logger.error(
        'Error saving progress',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          lastSync: blockNumber,
          error,
        }),
      )
      throw error
    }
  }

  /**
   * Mark the service as ended
   */
  async markAsEnded(): Promise<void> {
    try {
      const configIndex = await Models.ConfigIndexer.findExistingLog({
        network: this.network,
        service: this.service,
      })

      if (configIndex) {
        await configIndex.update({ end: true })
        logger.verbose(
          'Marked service as ended',
          llo({
            service: 'ProgressTracker',
            network: this.network,
            logService: this.service,
          }),
        )
      } else {
        logger.warn(
          'Cannot mark as ended - config does not exist',
          llo({
            service: 'ProgressTracker',
            network: this.network,
            logService: this.service,
          }),
        )
      }
    } catch (error) {
      logger.error(
        'Error marking as ended',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          error,
        }),
      )
      throw error
    }
  }

  /**
   * Get current progress information
   */
  async getProgressInfo(): Promise<IProgressInfo> {
    try {
      const existingConfig = await Models.ConfigIndexer.findExistingLog({
        network: this.network,
        service: this.service,
      })

      if (existingConfig) {
        return {
          lastSync: existingConfig.lastSync,
          isEnded: existingConfig.end,
          exists: true,
        }
      }

      return {
        lastSync: this.initialBlock,
        isEnded: false,
        exists: false,
      }
    } catch (error) {
      logger.error(
        'Error getting progress info',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          error,
        }),
      )
      throw error
    }
  }

  /**
   * Reset progress for the service (useful for testing or re-syncing)
   */
  async resetProgress(): Promise<void> {
    try {
      const result = await Models.ConfigIndexer.findOneAndUpdate(
        {
          network: this.network,
          service: this.service,
        },
        {
          $set: {
            lastSync: this.initialBlock,
            end: false,
          },
        },
        {
          new: true,
        },
      )

      if (result) {
        logger.verbose(
          'Reset progress',
          llo({
            service: 'ProgressTracker',
            network: this.network,
            logService: this.service,
            initialBlock: this.initialBlock,
          }),
        )
      }
    } catch (error) {
      logger.error(
        'Error resetting progress',
        llo({
          service: 'ProgressTracker',
          network: this.network,
          logService: this.service,
          error,
        }),
      )
      throw error
    }
  }

  /**
   * Check if the service has ended
   */
  async hasEnded(): Promise<boolean> {
    const info = await this.getProgressInfo()
    return info.isEnded
  }

  /**
   * Get network and service information
   */
  getConfig(): { network: NetworksEnum; service: LogServicePattern } {
    return {
      network: this.network,
      service: this.service,
    }
  }
}
