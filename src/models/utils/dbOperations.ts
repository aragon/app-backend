import logger from '@logger'
import DbTx from '@modules/dbTx'

class DbOperations {
  static async createDocument(model: any, data: any, info: any, logMsg: string, llo: any, opts?: any): Promise<any> {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const document = await model.create(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(`Created new document - ${logMsg}`, llo({ ...info, documentId: document.id }))
        return document
      }, opts)
    } catch (error) {
      logger.error(`Error creating document - ${logMsg}`, llo({ ...info, model, data, error }))
      return null
    }
  }

  static async updateDocument(document: any, data: any, info: any, logMsg: string, llo: any, opts?: any): Promise<any> {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const reloadDocument = await document.constructor.findById(document._id).session(session)
        await reloadDocument.update(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(`Updated document - ${logMsg}`, llo({ ...info, documentId: reloadDocument.id }))
        return reloadDocument
      }, opts)
    } catch (error) {
      logger.error(`Error updating document - ${logMsg}`, llo({ ...info, document, data, error }))
      return null
    }
  }
}

export default DbOperations
