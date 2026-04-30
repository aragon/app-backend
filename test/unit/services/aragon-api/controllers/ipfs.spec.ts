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

    it('strips unknown fields and keeps known ones (single)', async () => {
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

    it('parses the multi-statement (statements) shape with array content', async () => {
      const statements = {
        version: 1,
        type: 'statements',
        content: [
          { format: 'markdown', title: 'Protocol Health', content: 'I believe in long-term protocol health.' },
          { format: 'markdown', content: 'Decentralization first.' },
        ],
      }
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(statements as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal(statements)
    })

    it('strips unknown fields from multi-statement items', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statements',
        content: [{ format: 'markdown', content: 'hello', extra: 'dropped' }],
        topLevelExtra: 'dropped',
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statements',
        content: [{ format: 'markdown', content: 'hello' }],
      })
    })

    it('drops multi-statement items missing string content', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statements',
        content: [
          { format: 'markdown', content: 'kept' },
          { format: 'markdown' },
          { format: 'markdown', content: 42 },
          null,
        ],
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statements',
        content: [{ format: 'markdown', content: 'kept' }],
      })
    })

    it('throws badParams when multi-statement content is an empty array', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statements',
        content: [],
      } as any)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
    })

    it('throws badParams when all multi-statement items are filtered out', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statements',
        content: [{ format: 'markdown' }, { content: 42 }],
      } as any)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
    })

    it('parses single shape with object content (item-shaped)', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: { format: 'markdown', title: 'About me', content: 'rich item content' },
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: { format: 'markdown', title: 'About me', content: 'rich item content' },
      })
    })

    it('strips unknown fields from object content in single shape', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statement',
        content: { format: 'markdown', content: 'hello', extra: 'dropped' },
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: { format: 'markdown', content: 'hello' },
      })
    })

    it('throws badParams when single shape object content has empty content', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statement',
        content: { format: 'markdown', content: '' },
      } as any)

      await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
    })

    it('falls back to single shape when type=statements but content is not an array', async () => {
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves({
        version: 1,
        type: 'statements',
        content: 'plain text',
      } as any)

      const result = await IpfsController.getDelegateStatement(cid)

      expect(result).to.deep.equal({
        version: 1,
        type: 'statement',
        format: 'markdown',
        content: 'plain text',
      })
    })
  })
})
