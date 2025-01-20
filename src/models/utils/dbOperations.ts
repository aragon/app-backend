import DbTx from '@modules/dbTx'
import logger from '@logger'

class DbOperations {
  static async createDocument(model: any, data: any, info: any, logMsg: string, llo: any, opts?: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      try {
        const document = await model.create(data, { session })
        await session.commitTransaction()
        logger.verbose(`Created new document - ${logMsg}`, llo({ ...info, documentId: document.id }))
        return document
      } catch (error) {
        logger.error(`Error creating document - ${logMsg}`, llo({ ...info, model, data, error }))
        throw error
      }
    }, opts)
  }

  static async updateDocument(document: any, data: any, info: any, logMsg: string, llo: any, opts?: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      try {
        const reloadDocument = await document.constructor.findById(document._id).session(session)
        await reloadDocument.update(data, { session })
        await session.commitTransaction()
        logger.verbose(`Updated document - ${logMsg}`, llo({ ...info, documentId: reloadDocument.id }))
        return reloadDocument
      } catch (error) {
        logger.error(`Error updating document - ${logMsg}`, llo({ ...info, document, data, error }))
        throw error
      }
    }, opts)
  }
}

export default DbOperations
