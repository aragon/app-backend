import IPFSModule from '@modules/ipfs'
import IpfsController from '@services/aragon-api/controllers/ipfs'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Ipfs', () => {
  let sandbox: SinonSandbox

  const cid = 'QmTzQ1JRkWErjk39mryYw2WVaphAZNAREyMchXzYQ7c15S'

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDelegateStatement', () => {
    it('returns the parsed statement on a happy path', async () => {
      const statement = {
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: 'I believe in long-term protocol health.',
      }
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(statement as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal(statement)
    })

    it('passes the bare cid to IPFSModule (module strips any ipfs:// prefix internally)', async () => {
      const stub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ version: 1, content: 'x' } as any)

      await IpfsController.getDelegateStatement(cid)

      expect(stub.firstCall.args[0]).to.equal(cid)
    })

    it('throws notFound when IPFS returns null', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(null)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('notFound')
    })

    it('throws badParams when content is missing', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ version: 1 } as any)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
    })

    it('throws badParams when content is empty', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ version: 1, content: '' } as any)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
    })

    it('defaults version/type/format when missing and returns the parsed shape', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({ content: 'hello' } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: 'hello',
      })
    })

    it('strips unknown fields and keeps known ones', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 2,
        type: 'statement',
        format: 'markdown',
        content: 'something',
        extra: 'will be dropped',
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 2,
        type: 'statement',
        format: 'markdown',
        content: 'something',
      })
      expect(result).to.not.have.property('extra')
    })
  })
})
