import ErrorMiddleware from '@middlewares/error'
import UploadMiddleware, { fileFilter } from '@middlewares/upload'
import { ErrorKeyEnum } from '@types'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import supertest from 'supertest'

describe('Middleware: Upload', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fileFilter', () => {
    it('should accept JSON files with application/json mimetype', done => {
      const file = {
        mimetype: 'application/json',
        originalname: 'test.txt',
      }

      fileFilter(null, file, (error: Error | null, acceptFile: boolean) => {
        expect(error).to.be.null
        expect(acceptFile).to.be.true
        done()
      })
    })

    it('should accept files with .json extension', done => {
      const file = {
        mimetype: 'text/plain',
        originalname: 'data.json',
      }

      fileFilter(null, file, (error: Error | null, acceptFile: boolean) => {
        expect(error).to.be.null
        expect(acceptFile).to.be.true
        done()
      })
    })

    it('should reject non-JSON files', done => {
      const file = {
        mimetype: 'text/plain',
        originalname: 'test.txt',
      }

      fileFilter(null, file, (error: Error | null, acceptFile: boolean) => {
        expect(error).to.be.instanceOf(Error)
        expect(error?.message).to.equal('Only JSON files are allowed')
        expect(acceptFile).to.be.false
        done()
      })
    })
  })

  describe('single', () => {
    it('should return multer single middleware function', () => {
      const middleware = UploadMiddleware.single('file')

      expect(middleware).to.be.a('function')
    })

    it('returns 400 when the file field is wrong', async () => {
      const app = new Koa()
      app.use(ErrorMiddleware())
      app.use(UploadMiddleware.single('membersFile'))

      const response = await supertest(app.callback())
        .post('/v2/capital-distributor/campaign/upload')
        .attach('members', Buffer.from('{}'), 'members.json')

      expect(response.status).to.equal(400)
      expect(response.body.code).to.equal(ErrorKeyEnum.badParams)
      expect(response.body.description).to.equal('Unexpected file field')
    })

    it('returns 400 when the file is not JSON', async () => {
      const app = new Koa()
      app.use(ErrorMiddleware())
      app.use(UploadMiddleware.single('membersFile'))

      const response = await supertest(app.callback())
        .post('/v2/capital-distributor/campaign/upload')
        .attach('membersFile', Buffer.from('not json'), { filename: 'members.txt', contentType: 'text/plain' })

      expect(response.status).to.equal(400)
      expect(response.body.code).to.equal(ErrorKeyEnum.badParams)
      expect(response.body.description).to.equal('Only JSON files are allowed')
    })

    it('passes the uploaded JSON file to the next middleware', async () => {
      const app = new Koa()
      const content = Buffer.from('{"members":[]}')
      let uploadedFile: any
      app.use(ErrorMiddleware())
      app.use(UploadMiddleware.single('membersFile'))
      app.use(ctx => {
        uploadedFile = ctx.file
        ctx.status = 204
      })

      const response = await supertest(app.callback())
        .post('/v2/capital-distributor/campaign/upload')
        .attach('membersFile', content, 'members.json')

      expect(response.status).to.equal(204)
      expect(uploadedFile.originalname).to.equal('members.json')
      expect(uploadedFile.buffer).to.deep.equal(content)
    })

    it('keeps errors from the next middleware as 500', async () => {
      const app = new Koa()
      app.use(ErrorMiddleware())
      app.use(UploadMiddleware.single('membersFile'))
      app.use(() => {
        throw new Error('controller failed')
      })

      const response = await supertest(app.callback())
        .post('/v2/capital-distributor/campaign/upload')
        .attach('membersFile', Buffer.from('{}'), 'members.json')

      expect(response.status).to.equal(500)
      expect(response.body.code).to.equal(ErrorKeyEnum.unknownError)
    })
  })

  describe('parseJsonFile', () => {
    it('should parse valid JSON file successfully', () => {
      const jsonData = { name: 'test', value: 123 }
      const mockCtx = {
        file: {
          buffer: Buffer.from(JSON.stringify(jsonData), 'utf8'),
          originalname: 'test.json',
          mimetype: 'application/json',
        },
      } as any

      const result = UploadMiddleware.parseJsonFile(mockCtx)

      expect(result).to.deep.equal(jsonData)
    })

    it('should parse JSON array', () => {
      const arrayData = [
        { address: '0x123', amount: '1000' },
        { address: '0x456', amount: '2000' },
      ]
      const mockCtx = {
        file: {
          buffer: Buffer.from(JSON.stringify(arrayData), 'utf8'),
          originalname: 'array.json',
          mimetype: 'application/json',
        },
      } as any

      const result = UploadMiddleware.parseJsonFile(mockCtx)

      expect(result).to.deep.equal(arrayData)
    })

    it('should throw error when no file is uploaded', () => {
      const mockCtx = {
        file: null,
      } as any

      expect(() => UploadMiddleware.parseJsonFile(mockCtx)).to.throw('No file uploaded')
    })

    it('should throw error for invalid JSON format', () => {
      const mockCtx = {
        file: {
          buffer: Buffer.from('invalid json content', 'utf8'),
          originalname: 'invalid.json',
          mimetype: 'application/json',
        },
      } as any

      expect(() => UploadMiddleware.parseJsonFile(mockCtx)).to.throw('Invalid JSON file format')
    })

    it('should handle empty buffer', () => {
      const mockCtx = {
        file: {
          buffer: Buffer.from('', 'utf8'),
          originalname: 'empty.json',
          mimetype: 'application/json',
        },
      } as any

      expect(() => UploadMiddleware.parseJsonFile(mockCtx)).to.throw('Invalid JSON file format')
    })
  })
})
