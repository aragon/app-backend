import config from '@config'
import IpfsProviders, { CODEC_DAG_PB, CODEC_RAW } from '@modules/ipfsProviders'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

// real proposal metadata from arbitrum-mainnet: a CIDv1 raw block and a CIDv0 dag-pb block
const RAW_CID = 'bafkreifstrrnt2dsum6t5edwmnk72k2zl5v2frhujfgy5dtyjxlpvx3xjy'
const RAW_CONTENT = Buffer.from(
  '{"title":"Approve & Deposit to Llamalend WBTC/CRVUSD Pool","summary":"","description":"","resources":[]}',
)

const DAG_PB_CID = 'QmaXVxBnSk2AsUwz4Y2ebM6h5GTYQgJoH79sydTUUXPXkV'
const DAG_PB_BLOCK = Buffer.from(
  'CrwGCAIStAZ7CiAgInRpdGxlIjogIlVwZ3JhZGluZyBUb2tlblZvdGluZyIsCiAgInN1bW1hcnkiOiAiVXBncmFkaW5nIHRoZSBUb2tlbiBWb3RpbmcgUGx1Z2luIHRvIDEuNCIsCiAgImRlc2NyaXB0aW9uIjogIiMgUGx1Z2luIHVwZ3JhZGVcblxuLSBTdXBwb3J0aW5nIHRpbWVzdGFtcCBiYXNlZCBJVm90ZXMgdG9rZW5zXG4tIEFsbG93aW5nIHRvIGZyZWV6ZSB0b2tlbiBtaW50aW5nXG4tIEFsbG93aW5nIHRvIGV4Y2x1ZGUgYWRkcmVzc2VzIGZyb20gdGhlIHRvdGFsIHRva2VuIHN1cHBseVxuXG4jIFB1Ymxpc2ggTmV3IFBsZ3VpbiBWZXJzaW9uXG4tIFB1Ymxpc2hlcyB0aGUgVG9rZW5Wb3RpbmcgUGx1Z2luIFNldHVwIGRlcGxveWVkIGF0IGAweDhmNDRlNmUwZWE3Y2JmYTI5NjQyMTNjNzA0MTAzZTIzODRmY2QzM2ZgIGFzICoqdjEuNCoqIGluIHRoZSBgdG9rZW4tdm90aW5nLnBsdWdpbi5kYW8uZXRoYCBwbHVnaW4gcmVwb3NpdG9yeSBhdCBgMHgxQWVEMkJFYjQ3MGFlRkQ2NUI0M2Y5MDVCZDUzNzFiMUU0NzQ5ZDE4YCwgd2l0aCByZWxlYXNlIG1ldGFkYXRhIGBpcGZzOi8vUW1XalpBcnZlUG5NUGdiZktBTVczVGlkYnFIRXk2OFVWNlN2UkJoaWF5Z0d0YWAgYW5kIGJ1aWxkIG1ldGFkYXRhIGBpcGZzOi8vUW1mWFV5NUxjNGlxZzhEdmdXZFNTRDJaaENtQ0d2RTJXVGRXWUZFOXNvc0NSY2AuICIsCiAgInJlc291cmNlcyI6IFsKICAgIHsKICAgICAgIm5hbWUiOiAiQXVkaXQgcmVwb3J0IiwKICAgICAgInVybCI6ICJodHRwczovL2dpdGh1Yi5jb20vYXJhZ29uL3Rva2VuLXZvdGluZy1wbHVnaW4vdHJlZS9tYWluL2F1ZGl0cyIKICAgIH0KICBdCn0KGLQG',
  'base64',
)

describe('Modules: IpfsProviders', () => {
  describe('decodeCid', () => {
    it('decodes a CIDv1 raw sha256 cid', () => {
      const decoded = IpfsProviders.decodeCid(RAW_CID)
      expect(decoded).to.not.be.null
      expect(decoded!.version).to.eq(1)
      expect(decoded!.codec).to.eq(CODEC_RAW)
      expect(decoded!.digest.length).to.eq(32)
    })

    it('decodes a CIDv0 dag-pb cid', () => {
      const decoded = IpfsProviders.decodeCid(DAG_PB_CID)
      expect(decoded).to.not.be.null
      expect(decoded!.version).to.eq(0)
      expect(decoded!.codec).to.eq(CODEC_DAG_PB)
      expect(decoded!.digest.length).to.eq(32)
    })

    it('rejects a dag-cbor cid', () => {
      expect(IpfsProviders.decodeCid('bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).to.be.null
    })

    it('rejects a non-sha256 cid', () => {
      expect(IpfsProviders.decodeCid('bafk2bzaceaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).to.be.null
    })

    it('rejects malformed input', () => {
      expect(IpfsProviders.decodeCid('invalidCID')).to.be.null
      expect(IpfsProviders.decodeCid('')).to.be.null
      expect(IpfsProviders.decodeCid('QmaXVxBnSk2AsUwz4Y2ebM6h5GTYQgJoH79sydTUUXPXk0')).to.be.null
      expect(IpfsProviders.decodeCid('BAFKREIFSTRRNT2DSUM6T5EDWMNK72K2ZL5V2FRHUJFGY5DTYJXLPVX3XJY')).to.be.null
    })
  })

  describe('verifyBlock', () => {
    it('accepts a raw block whose bytes hash to the cid digest', () => {
      const decoded = IpfsProviders.decodeCid(RAW_CID)!
      expect(IpfsProviders.verifyBlock(decoded, RAW_CONTENT)).to.be.true
    })

    it('accepts a dag-pb block whose bytes hash to the cid digest', () => {
      const decoded = IpfsProviders.decodeCid(DAG_PB_CID)!
      expect(IpfsProviders.verifyBlock(decoded, DAG_PB_BLOCK)).to.be.true
    })

    it('rejects tampered bytes', () => {
      const decoded = IpfsProviders.decodeCid(RAW_CID)!
      const tampered = Buffer.from(RAW_CONTENT)
      tampered[0] = 0x5b
      expect(IpfsProviders.verifyBlock(decoded, tampered)).to.be.false
    })
  })

  describe('unwrapUnixFs', () => {
    it('extracts the file content from a single-block dag-pb node', () => {
      const content = IpfsProviders.unwrapUnixFs(DAG_PB_BLOCK)
      expect(content).to.not.be.null
      const metadata = JSON.parse(content!.toString())
      expect(metadata.title).to.eq('Upgrading TokenVoting')
      expect(metadata.resources[0].name).to.eq('Audit report')
    })

    it('rejects a node that has links (multi-block file)', () => {
      // field 2 (Links), length-delimited, empty link entry
      const withLink = Buffer.concat([Buffer.from([0x12, 0x00]), DAG_PB_BLOCK])
      expect(IpfsProviders.unwrapUnixFs(withLink)).to.be.null
    })

    it('rejects garbage bytes', () => {
      expect(IpfsProviders.unwrapUnixFs(Buffer.from([0xff, 0xff, 0xff]))).to.be.null
      expect(IpfsProviders.unwrapUnixFs(RAW_CONTENT)).to.be.null
    })
  })

  describe('findHttpProviders', () => {
    let sandbox: SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
    })

    afterEach(() => {
      sandbox.restore()
    })

    const routingResponse = {
      Providers: [
        {
          Addrs: ['/dns4/bitswap.pinata.cloud/tcp/443/wss'],
          Protocols: ['transport-bitswap'],
        },
        {
          Addrs: ['/dns4/gateway-v1.pinata.cloud/tcp/443/https'],
          Protocols: ['transport-ipfs-gateway-http'],
        },
        {
          Addrs: ['/dns4/gateway-v1.pinata.cloud/tcp/443/https'],
          Protocols: ['transport-ipfs-gateway-http'],
        },
      ],
    }

    it('returns deduped https urls of http gateway providers only', async () => {
      const stubFetch = sandbox.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => routingResponse,
      } as any)

      const providers = await IpfsProviders.findHttpProviders(RAW_CID, 5000)

      expect(providers).to.deep.equal(['https://gateway-v1.pinata.cloud'])
      expect(stubFetch.firstCall.args[0]).to.eq(`${config.IPFS.DELEGATED_ROUTING_URI}/providers/${RAW_CID}`)
    })

    it('returns an empty array when the routing endpoint fails', async () => {
      sandbox.stub(global, 'fetch').rejects(new Error('network down'))
      expect(await IpfsProviders.findHttpProviders(RAW_CID, 5000)).to.deep.equal([])
    })

    it('returns an empty array on a non-ok response', async () => {
      sandbox.stub(global, 'fetch').resolves({ ok: false, status: 500 } as any)
      expect(await IpfsProviders.findHttpProviders(RAW_CID, 5000)).to.deep.equal([])
    })
  })

  describe('fetchVerifiedContent', () => {
    let sandbox: SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
    })

    afterEach(() => {
      sandbox.restore()
    })

    it('returns parsed json for a verified raw block', async () => {
      const stubFetch = sandbox.stub(global, 'fetch').resolves({
        ok: true,
        arrayBuffer: async () =>
          RAW_CONTENT.buffer.slice(RAW_CONTENT.byteOffset, RAW_CONTENT.byteOffset + RAW_CONTENT.length),
      } as any)

      const content = await IpfsProviders.fetchVerifiedContent('https://gw.example.com', RAW_CID, 5000)

      expect(content.title).to.eq('Approve & Deposit to Llamalend WBTC/CRVUSD Pool')
      expect(stubFetch.firstCall.args[0]).to.eq(`https://gw.example.com/ipfs/${RAW_CID}?format=raw`)
    })

    it('returns parsed json for a verified dag-pb block', async () => {
      sandbox.stub(global, 'fetch').resolves({
        ok: true,
        arrayBuffer: async () =>
          DAG_PB_BLOCK.buffer.slice(DAG_PB_BLOCK.byteOffset, DAG_PB_BLOCK.byteOffset + DAG_PB_BLOCK.length),
      } as any)

      const content = await IpfsProviders.fetchVerifiedContent('https://gw.example.com', DAG_PB_CID, 5000)

      expect(content.title).to.eq('Upgrading TokenVoting')
    })

    it('rejects a block that does not hash to the cid digest', async () => {
      const wrong = Buffer.from('{"title":"forged"}')
      sandbox.stub(global, 'fetch').resolves({
        ok: true,
        arrayBuffer: async () => wrong.buffer.slice(wrong.byteOffset, wrong.byteOffset + wrong.length),
      } as any)

      expect(await IpfsProviders.fetchVerifiedContent('https://gw.example.com', RAW_CID, 5000)).to.be.null
    })

    it('returns null on provider errors and invalid cids', async () => {
      sandbox.stub(global, 'fetch').rejects(new Error('timeout'))
      expect(await IpfsProviders.fetchVerifiedContent('https://gw.example.com', RAW_CID, 5000)).to.be.null
      expect(await IpfsProviders.fetchVerifiedContent('https://gw.example.com', 'invalidCID', 5000)).to.be.null
    })
  })

  describe('parseMultiaddrToUrl', () => {
    it('parses the https gateway forms', () => {
      expect(IpfsProviders.parseMultiaddrToUrl('/dns4/gateway-v1.pinata.cloud/tcp/443/https')).to.eq(
        'https://gateway-v1.pinata.cloud',
      )
      expect(IpfsProviders.parseMultiaddrToUrl('/dns6/gw.example.com/tcp/443/tls/http')).to.eq('https://gw.example.com')
    })

    it('rejects everything outside the https subset', () => {
      expect(IpfsProviders.parseMultiaddrToUrl('/dns4/bitswap.pinata.cloud/tcp/443/wss')).to.be.null
      expect(IpfsProviders.parseMultiaddrToUrl('/dnsaddr/bitswap.pinata.cloud')).to.be.null
      expect(IpfsProviders.parseMultiaddrToUrl('/dns4/gw.example.com/tcp/80/http')).to.be.null
      expect(IpfsProviders.parseMultiaddrToUrl('/ip4/1.2.3.4/tcp/443/https')).to.be.null
      expect(IpfsProviders.parseMultiaddrToUrl('/dns4/bad host/tcp/443/https')).to.be.null
      expect(IpfsProviders.parseMultiaddrToUrl('')).to.be.null
    })
  })
})
