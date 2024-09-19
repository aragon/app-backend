import DbTx from '@modules/dbTx'
import logger from '@logger'

class DbOperations {
  static async createDocument(model: any, data: any, info: any, logMsg: string, llo: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      try {
        const document = await model.create(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(`Created new document - ${logMsg}`, llo({ ...info, documentId: document.id }))
        return document
      } catch (error) {
        logger.error(`Failed to create document - ${logMsg}`, llo({ ...info, error }))
        throw error
        // TODO: if already exists query and return
      }
    })
  }

  static async updateDocument(document: any, data: any, info: any, logMsg: string, llo: any): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      try {
        await document.update(data, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(`Updated document - ${logMsg}`, llo({ ...info, documentId: document.id }))
        return document
      } catch (error) {
        logger.error(`Failed to update document - ${logMsg}`, llo({ ...info, error }))
        throw error
      }
    })
  }
}

export default DbOperations
