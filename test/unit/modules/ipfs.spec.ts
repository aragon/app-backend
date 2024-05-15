import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IPFSModule from '@modules/ipfs'
import axios from 'axios'
import logger from '@logger'
import PinataHelper from '@helpers/pinata'
import config from '@config'

describe('Modules: IPFS', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('pinList', async () => {
    const stubPinata = sandbox.stub(PinataHelper, 'pinList').returns(true as any)
    const cid = 'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
    const result = await IPFSModule.pinList(cid)
    expect(result).to.be.true
    expect(stubPinata.calledOnceWith(cid)).to.be.true
  })

  it('unPinMetadata', async () => {
    const stubPinata = sandbox.stub(PinataHelper, 'unPin').returns(true as any)
    const cid = 'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
    const result = await IPFSModule.unPinMetadata(cid)
    expect(result).to.be.true
    expect(stubPinata.calledOnceWith(cid)).to.be.true
  })

  it('pinataMetadata', async () => {
    const stubPinata = sandbox.stub(PinataHelper, 'uploadAndPinMetadata').returns(true as any)
    const metadata = { name: 'test' }
    const result = await IPFSModule.pinataMetadata(metadata as any)
    expect(result).to.be.true
    expect(stubPinata.calledOnceWith(metadata)).to.be.true
  })

  it('_isValidCIDv0', () => {
    expect(IPFSModule._isValidCIDv0('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
    expect(IPFSModule._isValidCIDv0('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.false
    expect(IPFSModule._isValidCIDv0('invalidCID')).to.be.false
  })

  it('_isValidCIDv1', () => {
    expect(IPFSModule._isValidCIDv1('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
    expect(IPFSModule._isValidCIDv1('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.false
    expect(IPFSModule._isValidCIDv1('invalidCID')).to.be.false
  })

  it('isValidIpfsUrl', () => {
    expect(IPFSModule.isValidIpfsUrl('ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
    expect(IPFSModule.isValidIpfsUrl('ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
    expect(IPFSModule.isValidIpfsUrl('ipfs://invalidCID')).to.be.false

    expect(IPFSModule.isValidIpfsUrl(undefined as any)).to.be.false
    expect(IPFSModule.isValidIpfsUrl('')).to.be.false
    expect(IPFSModule.isValidIpfsUrl(null as any)).to.be.false
  })

  it('_parseMetadata', () => {
    const metadata = {}
    const resp = IPFSModule._parseDaoMetadata(metadata)

    expect(resp.name).to.eq(null)
    expect(resp.description).to.eq(null)
    expect(resp.avatar).to.eq(null)
    expect(resp.links?.length).to.eq(0)

    const metadata2 = {
      name: 'test',
      description: 'test',
      avatar: 'test',
      links: ['test'],
    }
    const resp2 = IPFSModule._parseDaoMetadata(metadata2 as any)

    expect(resp2.name).to.eq('test')
    expect(resp2.description).to.eq('test')
    expect(resp2.avatar).to.eq('test')
    expect(resp2.links![0]).to.eq('test')
  })

  describe('_fetchMetadata', function () {
    it('should _fetchMetadata', async () => {
      const stubReq = sandbox.stub(axios, 'get').returns({ data: 'ok' } as any)
      const stubParseMetadata = sandbox.stub(IPFSModule, '_parseDaoMetadata').returns(true as any)
      const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
      const metadata = await IPFSModule._fetchMetadata(cid)

      expect(metadata).to.be.true
      expect(stubReq.calledOnce).to.be.true
      expect(stubReq.calledWith(`https://ipfs.io/ipfs/${cid}`)).to.be.true
      expect(stubParseMetadata.calledOnce).to.be.true
      expect(stubParseMetadata.calledWith('ok' as any)).to.be.true
    })

    it('should log an error when _fetchMetadata', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      config.IPFS.METADATA_FETCH_RETRY = 0
      config.IPFS.METADATA_FETCH_DELAY = 0

      const error = new Error('Network error')
      sandbox.stub(axios, 'get').rejects(error)
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await IPFSModule._fetchMetadata('cid')

      expect(result).to.be.null
      expect(loggerErrorStub.args[0][0]).to.eq('Failed to fetch metadata from IPFS')

      config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
      config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
    })
  })

  describe('fetchMetadata', function () {
    it('should call fetchMetadata for CIDv1 and fallback to Pinata if necessary', async function () {
      const cidV1 = 'ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(expectedMetadata)

      const result = await IPFSModule.fetchMetadata(cidV1)

      expect(stubFetchMetadata.calledOnceWith('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
      expect(stubPinataGetData.calledOnceWith('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call fetchMetadata for CIDv0 and fallback to Pinata if necessary', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(expectedMetadata)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadata.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(stubPinataGetData.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should return null for invalid CID', async function () {
      const invalidCid = 'ipfs://invalidCID'

      const result = await IPFSModule.fetchMetadata(invalidCid)

      expect(result).to.be.null
    })
  })
})
