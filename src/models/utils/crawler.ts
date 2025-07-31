import { type Document, type Model } from 'mongoose'
import * as async from 'async'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules: Crawler' })

class DBCrawler {
  private readonly model: Model<Document>
  private readonly onDocument: (document: Document, stat: { nbWorked: number; nbTotal: number }) => Promise<void>

  private readonly where: object
  private readonly stopOnError: boolean
  private readonly useAggregate: boolean
  private readonly disablePagination: boolean
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
  private isOnError: boolean
  private nbWorked: number
  private nbTotal: number
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
     * @description disablePagination
     * @param {disablePagination}
     * @example true
     */
    this.disablePagination = opts.disablePagination

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
    this.skip = !this.disablePagination ? opts.skip || 0 : undefined

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
    this.nbWorked = 0
    this.nbTotal = 0
    this.crawlResult = { nbSuccess: 0, nbError: 0, nbTotal: 0, lastCreatedAt: null }

    this.queue = async.queue((document: Document, callback: any) => {
      this._worker(document)
        .then(() => callback())
        .catch(() => callback())
    }, this.concurrency) as any
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
    const where = this.where
    const select = this.select
    const populate = this.populate
    const useAggregate = this.useAggregate

    if (useAggregate) {
      const aggregatePipeline = this.aggregate(skip, limit)
      const response = this.model.aggregate(aggregatePipeline)
      const documents = await response.exec()
      return documents
    } else {
      let response: any = this.model.find(where).select(select).populate(populate)

      if (limit && !this.disablePagination) {
        response = response.limit(limit)
      }

      if (skip && !this.disablePagination) {
        response = response.skip(skip)
      }

      if (this.sort) {
        response = response.sort(this.sort)
      }

      if (this.raw) {
        response = response.lean()
      }

      return await response.exec()
    }
  }

  async _worker(document: Document): Promise<void> {
    this.nbWorked++

    const stat = {
      nbWorked: this.nbWorked,
      nbTotal: this.nbTotal,
    }

    try {
      await this.onDocument(document, stat)
      this.crawlResult.nbSuccess++
      this.crawlResult.lastCreatedAt = ((document as any)?.updatedAt || (document as any)?.createdAt) ?? null
    } catch (error: any) {
      this.onError(error, document)
      this.crawlResult.nbError++
      if (this.stopOnError) {
        this.isOnError = true
      }
    }
  }

  async crawl(): Promise<any> {
    if (this.crawling) {
      throw new Error('Already crawling')
    }

    this.crawling = true
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
      const limit = this.disablePagination ? undefined : this.batchSize
      let skip = this.disablePagination ? undefined : this.skip

      const fillQueue = async (): Promise<any> => {
        if (this.isOnError || !this.crawling) {
          // Wait for queue to complete processing
          if (this.queue.idle()) {
            resolve(this.crawlResult)
          } else {
            // Set up a one-time drain handler to resolve when queue empties
            this.queue.drain(() => {
              resolve(this.crawlResult)
            })
          }
          return true
        }

        this._fetchNext(limit, skip)
          .then((items: any) => {
            if (items?.length > 0) {
              // eslint-disable-next-line
              this.queue.push(items)

              if (this.disablePagination) {
                this.crawling = false

                // Wait for queue to finish
                if (this.queue.idle()) {
                  return resolve(this.crawlResult)
                } else {
                  // Queue will resolve when drained
                  this.queue.drain(() => {
                    resolve(this.crawlResult)
                  })
                }
              } else {
                skip! += limit!
              }
            } else {
              this.crawling = false

              // No more items, wait for queue to finish
              if (this.queue.idle()) {
                return resolve(this.crawlResult)
              } else {
                // Queue will resolve when drained
                this.queue.drain(() => {
                  resolve(this.crawlResult)
                })
              }
            }

            return true
          })
          .catch((error: any) => {
            reject(error)
          })
      }

      // Keep original behavior - drain calls fillQueue
      this.queue.drain(fillQueue) // eslint-disable-line
      fillQueue() // eslint-disable-line
    })
  }
}

export default DBCrawler
