import config from '@config'
import multer from '@koa/multer'
import { type RouterContext } from '@koa/router'

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
  single: (fieldName: string) => upload.single(fieldName),

  parseJsonFile: (ctx: RouterContext) => {
    if (!ctx.file) {
      throw new Error('No file uploaded')
    }

    try {
      return JSON.parse(ctx.file.buffer.toString('utf8'))
    } catch (_error) {
      throw new Error('Invalid JSON file format')
    }
  },
}

export default UploadMiddleware
