import config from '@config'
import { throwExposable } from '@errors'
import multer from '@koa/multer'
import { type RouterContext } from '@koa/router'
import { ErrorKeyEnum } from '@types'
import { type Next } from 'koa'

const storage = multer.memoryStorage()

export const fileFilter = (req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
  if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
    cb(null, true)
  } else {
    cb(new Error('Only JSON files are allowed'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.FILE_UPLOADS.MAX_FILE_SIZE_MB,
    files: 1,
  },
})

const UploadMiddleware = {
  single: (fieldName: string) => {
    const parse = upload.single(fieldName)

    return async (ctx: RouterContext, next: Next) => {
      try {
        await parse(ctx, async () => {})
      } catch (error: any) {
        throwExposable(ErrorKeyEnum.badParams, 400, error.message)
      }

      return next()
    }
  },

  parseJsonFile: (ctx: RouterContext) => {
    if (!ctx.file) {
      throw new Error('No file uploaded')
    }

    try {
      return JSON.parse(ctx.file.buffer.toString('utf8'))
    } catch (_error) {
      throwExposable(ErrorKeyEnum.badParams, 400, 'Invalid JSON file format')
    }
  },
}

export default UploadMiddleware
