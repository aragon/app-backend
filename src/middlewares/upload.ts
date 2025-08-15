import multer from '@koa/multer'
import { type RouterContext } from '@koa/router'

const storage = multer.memoryStorage()

const fileFilter = (req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
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
    fileSize: 10 * 1024 * 1024,
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
    } catch (error) {
      throw new Error('Invalid JSON file format')
    }
  },
}

export default UploadMiddleware
