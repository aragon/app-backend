import { type Document, type Model } from 'mongoose'
import * as async from 'async'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules: Crawler' })

class DBCrawler {
  private readonly model: Model<Document>
  private readonly onDocument: (document: Document, stat: { nbWorked: number; nbTotal: number }) => Promise<void>

  private readonly where: object
  public stopOnError: boolean
  private readonly useAggregate: boolean
  private readonly aggregate: (skip: number | undefined, limit: number | undefined) => any[]
  private readonly select: string
  private readonly skip: number
  private readonly sort: string
  private readonly raw: boolean
  private readonly populate: string
  private readonly onError: (error: Error, document: Document) => void
  private readonly concurrency: number
  private readonly batchSize: number
  private crawling: boolean
  private nbWorked: number
  private nbTotal: number
  private isCompleted: boolean
  public isOnError: boolean
  private crawlResolve: any
  private readonly processedIds = new Set<string>()
  public readonly crawlResult: { nbSuccess: number; nbError: number; nbTotal: number; lastCreatedAt: null | Date }
  private readonly queue: async.QueueObject<Document[]>

  constructor(opts: any) {
    if (!opts.onDocument) {
      throw new Error('Need onDocument method')
    }

    if (!opts.model) {
      throw new Error('Need model to crawl')
    }

    /**
     * @description mongoose model
     * @param {model}
     * @example mongoose.model('invoice')
     */
    this.model = opts.model

    /**
     * @description mongoose model
     * @param {onDocument}
     * @example myFunction
     * @returns {Function} Returns a function with the current document
     */
    this.onDocument = opts.onDocument

    /**
     * @description where document
     * @param {where}
     * @example {name: 'goo', surname: 'baspp'}
     */
    this.where = opts.where || {}

    /**
     * @description stopOnError
     * @param {stopOnError}
     * @example true
     */
    this.stopOnError = opts.stopOnError

    /**
     * @description useAggregate
     * @param {useAggregate}
     * @example true
     */
    this.useAggregate = opts.useAggregate || false

    /**
     * @description aggregation document
     * @param {aggregate}
     * @example [{$lookup: {from: 'subscriptions'}}]
     */
    this.aggregate = opts.aggregate

    /**
     * @description select document fields
     * @param {select}
     * @example '_id name surname'
     */
    this.select = opts.select || ''

    /**
     * @description set skip documents
     * @param {skip}
     * @example 100
     */
    this.skip = opts.skip

    /**
     * @description sort documents
     * @param {sort}
     * @example {'created_at': -1}
     */
    this.sort = opts.sort || undefined

    /**
     * @description get raw documents
     * @param {boolean}
     * @example true
     */
    this.raw = opts.raw || false

    /**
     * @description populate document
     * @param {populate}
     * @example 'tags', '_id name'
     */
    this.populate = opts.populate || ''

    this.onError = opts.onError || DBCrawler.defaultOnError
    this.concurrency = opts.concurrency || 2
    this.batchSize = opts.batchSize || 10
    this.crawling = false
    this.isOnError = false
    this.isCompleted = false
    this.nbWorked = 0
    this.nbTotal = 0
    this.crawlResult = { nbSuccess: 0, nbError: 0, nbTotal: 0, lastCreatedAt: null }

    this.queue = async.queue(this._worker.bind(this) as any, this.concurrency)
  }

  static defaultOnError(error: Error, document: Document): void {
    logger.error(
      'error on db crawler',
      llo({
        error,
        documentId: document._id,
      }),
    )
  }

  static aggregatePagination(skip: number | undefined, limit: number | undefined): object[] {
    if (!skip && !limit) {
      return []
    }

    return [{ $skip: skip }, { $limit: limit }]
  }

  async _fetchNext(limit: number | undefined, skip: number | undefined): Promise<any> {
    const where = { ...this.where } as any
    const select = this.select
    const populate = this.populate
    const useAggregate = this.useAggregate

    // Exclude already processed IDs
    if (this.processedIds.size > 0) {
      const excludeIds = Array.from(this.processedIds)
      where._id = { $nin: excludeIds }
    }

    if (useAggregate) {
      // For aggregation, we need to add the exclusion to the pipeline
      let aggregatePipeline = this.aggregate(skip, limit)

      if (this.processedIds.size > 0) {
        const excludeIds = Array.from(this.processedIds)
        // Add match stage to exclude processed IDs at the beginning
        aggregatePipeline = [{ $match: { _id: { $nin: excludeIds } } }, ...aggregatePipeline]
      }

      const response = this.model.aggregate(aggregatePipeline)
      return await response.exec()
    } else {
      let response: any = this.model.find(where).select(select).populate(populate)

      if (limit) {
        response = response.limit(limit)
      }

      // For non-aggregate queries, we don't use skip when we have processed IDs
      // because we're already filtering them out
      if (skip && this.processedIds.size === 0) {
        response = response.skip(skip)
      }

      if (this.sort) {
        response = response.sort(this.sort)
      }

      if (this.raw) {
        response = response.lean()
      }

      const results = await response.exec()

      // Double-check for duplicates (extra safety)
      const newDocuments = results.filter(doc => {
        const id = doc._id.toString()
        if (this.processedIds.has(id)) {
          return false
        }
        return true
      })

      return newDocuments
    }
  }

  async _worker(document: any): Promise<void> {
    const docId = document._id.toString()

    // Add to processed IDs immediately to prevent reprocessing
    this.processedIds.add(docId)

    this.nbWorked++

    const stat = {
      nbWorked: this.nbWorked,
      nbTotal: this.nbTotal,
    }

    try {
      await this.onDocument(document, stat)
      this.crawlResult.nbSuccess++
      this.crawlResult.lastCreatedAt = (document?.updatedAt || document?.createdAt) ?? null
    } catch (error: any) {
      this.onError(error, document)
      this.crawlResult.nbError++
      if (this.stopOnError) {
        this.isOnError = true
        this.crawling = false
        this.isCompleted = true
        this.queue.kill()

        // Force immediate resolution
        setImmediate(() => {
          this._finalizeCrawl(this.crawlResolve)
        })
      }
    }
  }

  async crawl(): Promise<any> {
    if (this.crawling) {
      throw new Error('Already crawling')
    }

    this.crawling = true
    this.processedIds.clear() // Reset processed IDs for fresh crawl
    const where = this.where || {}

    if (!this.useAggregate) {
      this.nbTotal = await this.model.countDocuments(where)
    } else {
      const countAggregatePipeline = [...this.aggregate(undefined, undefined), { $count: 'totalRecords' }]
      const countResponse = await this.model.aggregate(countAggregatePipeline).exec()
      this.nbTotal = countResponse.length > 0 && countResponse[0]?.totalRecords ? countResponse[0].totalRecords : 0
    }

    this.crawlResult.nbTotal = this.nbTotal

    return await new Promise((resolve, reject) => {
      this.crawlResolve = resolve
      const limit = this.batchSize
      let skip = this.skip || 0
      let consecutiveEmptyBatches = 0
      const maxConsecutiveEmptyBatches = 3 // Safety limit

      const fillQueue = async (): Promise<any> => {
        if (this.isCompleted) {
          return true
        }

        if (this.isOnError || !this.crawling) {
          this.isCompleted = true
          this._finalizeCrawl(resolve)
          return true
        }

        try {
          const items = await this._fetchNext(limit, skip)

          if (items.length === 0) {
            consecutiveEmptyBatches++

            // If we've had multiple empty batches or processed expected amount, we're done
            if (consecutiveEmptyBatches >= maxConsecutiveEmptyBatches || this.nbWorked >= this.nbTotal) {
              this.crawling = false
              this.isCompleted = true
              this._finalizeCrawl(resolve)
              return true
            }

            // Try once more with higher skip (in case of edge case)
            skip += limit
            setTimeout(async () => fillQueue(), 100) // Small delay before retry
            return true
          }

          consecutiveEmptyBatches = 0 // Reset counter on successful batch
          this.queue.push(items)

          // For non-aggregate queries with ID exclusion, we don't increment skip
          // because we're filtering by excluded IDs
          if (this.useAggregate || this.processedIds.size === 0) {
            skip += limit
          }

          // Check if we need to continue filling the queue
          if (this.queue.length() < this.concurrency && this.crawling && !this.isCompleted) {
            setImmediate(fillQueue)
          }
        } catch (error) {
          reject(error)
        }

        return true
      }

      // Set up drain handler for when queue becomes empty
      this.queue.drain(() => {
        if (this.crawling && !this.isCompleted && !this.isOnError) {
          setImmediate(fillQueue)
        }
      })

      // Start the crawling process
      fillQueue()
    })
  }

  private _finalizeCrawl(resolve: (value: any) => void): void {
    // Clear the drain handler to prevent infinite loops
    this.queue.drain(() => {})

    // If stopOnError triggered, resolve immediately
    if (this.isOnError && this.stopOnError) {
      resolve(this.crawlResult)
      return
    }

    if (this.queue.idle()) {
      resolve(this.crawlResult)
    } else {
      // Wait for remaining items to be processed
      const finalDrainHandler = () => {
        resolve(this.crawlResult)
      }
      this.queue.drain(finalDrainHandler)
    }
  }
}

export default DBCrawler
