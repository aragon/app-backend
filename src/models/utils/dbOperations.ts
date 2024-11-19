import DbTx from '@modules/dbTx'
import logger from '@logger'

class DbOperations {
  static async createDocument(model: any, data: any, info: any, logMsg: string, llo: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      const document = await model.create(data, { session })
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(`Created new document - ${logMsg}`, llo({ ...info, documentId: document.id }))
      return document
    })
  }

  static async updateDocument(document: any, data: any, info: any, logMsg: string, llo: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      const reloadDocument = await document.constructor.findById(document._id).session(session)
      await reloadDocument.update(data, { session })
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(`Updated document - ${logMsg}`, llo({ ...info, documentId: reloadDocument.id }))
      return reloadDocument
    })
  }
}

export default DbOperations
