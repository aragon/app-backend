import * as sinon from 'sinon'
import { expect } from 'chai'
import UploadMiddleware, { fileFilter } from '@middlewares/upload'

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
