import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IPFSModule from '@modules/ipfs'
import axios from 'axios'
import logger from '@logger'
import PinataHelper from '@helpers/pinata'
import config from '@config'
import Web3Utils from '@helpers/web3Utils'

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

  describe('_fetchMetadata', function () {
    it('should _fetchMetadata', async () => {
      const stubReq = sandbox.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => 'ok',
      } as any)

      const stubParseMetadata = sandbox.stub(Web3Utils, 'parseDaoMetadata').returns(true as any)
      const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'

      const metadata = await IPFSModule._fetchMetadata(cid)

      expect(metadata).to.be.true
      expect(stubReq.calledOnce).to.be.true
      expect(stubReq.calledWith(`https://ipfs.io/ipfs/${cid}`)).to.be.true
      expect(stubParseMetadata.calledOnce).to.be.true
      expect(stubParseMetadata.calledWith('ok' as any)).to.be.true
    })

    it('should log an error when _fetchMetadata fails', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      config.IPFS.METADATA_FETCH_RETRY = 0
      config.IPFS.METADATA_FETCH_DELAY = 0

      const error = new Error('Network error')
      sandbox.stub(global, 'fetch').rejects(error)

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await IPFSModule._fetchMetadata('cid')

      expect(result).to.be.null
      expect(loggerErrorStub.args[0][0]).to.eq('Failed to fetch metadata from IPFS')

      config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
      config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
    })
  })

  describe('fetchMetadata', function () {
    it('should call fetchMetadata for CIDv1 and fallback to old gateway if necessary', async function () {
      const cidV1 = 'ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(expectedMetadata)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV1)

      expect(stubFetchMetadata.calledOnceWith('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
      expect(stubPinataGetData.calledOnceWith('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call fetchMetadata for CIDv0 and fallback to old gateway if necessary', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(expectedMetadata)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadata.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(stubPinataGetData.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call fetchMetadata for avatar', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example', avatar: { path: 'test' } }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves({
        name: 'Example',
        avatar: { path: 'test' },
      } as any)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadata.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(stubPinataGetData.calledOnceWith('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')).to.be.true
      expect(result?.avatar).to.equal(expectedMetadata.avatar.path)
    })

    it('should return null for invalid CID', async function () {
      const invalidCid = 'ipfs://invalidCID'

      const result = await IPFSModule.fetchMetadata(invalidCid)

      expect(result).to.be.null
    })
  })
})
