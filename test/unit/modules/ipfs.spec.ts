import config from '@config'
import PinataHelper from '@helpers/pinata'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    it('should _fetchMetadata and return raw data without parsing', async () => {
      const rawMetadata = { title: 'Test', description: 'Raw metadata' }
      const stubReq = sandbox.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => rawMetadata,
      } as any)

      const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'

      const metadata = await IPFSModule._fetchMetadata(cid)

      expect(metadata).to.deep.equal(rawMetadata)
      expect(stubReq.calledOnce).to.be.true
      expect(stubReq.firstCall.args[0]).to.eq(`${config.IPFS.PUBLIC_GATEWAY_URI}/${cid}`)
    })

    it('should log a warning when _fetchMetadata fails', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      try {
        config.IPFS.METADATA_FETCH_RETRY = 0
        config.IPFS.METADATA_FETCH_DELAY = 0

        const error = new Error('Network error')
        sandbox.stub(global, 'fetch').rejects(error)

        const loggerWarnStub = sandbox.stub(logger, 'warn')

        const result = await IPFSModule._fetchMetadata('cid')

        expect(result).to.be.null
        expect(loggerWarnStub.args[0][0]).to.eq(`Failed to fetch metadata from ${config.IPFS.PUBLIC_GATEWAY_URI}`)
      } finally {
        config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
        config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
      }
    })
  })

  describe('_fetchMetadataDweb', function () {
    it('should _fetchMetadataDweb and return raw data', async () => {
      const rawMetadata = { title: 'Test', description: 'Raw metadata' }
      const stubReq = sandbox.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => rawMetadata,
      } as any)

      const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'

      const metadata = await IPFSModule._fetchMetadataDweb(cid)

      expect(metadata).to.deep.equal(rawMetadata)
      expect(stubReq.calledOnce).to.be.true
      expect(stubReq.firstCall.args[0]).to.eq(`${config.IPFS.DWEB_GATEWAY_URI}/${cid}`)
    })

    it('should log a warning when _fetchMetadataDweb fails', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      try {
        config.IPFS.METADATA_FETCH_RETRY = 0
        config.IPFS.METADATA_FETCH_DELAY = 0

        const error = new Error('Network error')
        sandbox.stub(global, 'fetch').rejects(error)

        const loggerWarnStub = sandbox.stub(logger, 'warn')

        const result = await IPFSModule._fetchMetadataDweb('cid')

        expect(result).to.be.null
        expect(loggerWarnStub.args[0][0]).to.eq(`Failed to fetch metadata from ${config.IPFS.DWEB_GATEWAY_URI}`)
      } finally {
        config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
        config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
      }
    })

    it('should return null without retrying on 4xx HTTP response', async () => {
      sandbox.stub(global, 'fetch').resolves({
        ok: false,
        status: 404,
      } as any)

      const result = await IPFSModule._fetchMetadataDweb('cid')

      expect(result).to.be.null
    })

    it('should retry on 5xx HTTP response and succeed on subsequent attempt', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      try {
        config.IPFS.METADATA_FETCH_RETRY = 1
        config.IPFS.METADATA_FETCH_DELAY = 0

        const expectedMetadata = { name: 'Success after retry' }
        const stubFetch = sandbox
          .stub(global, 'fetch')
          .onFirstCall()
          .resolves({ ok: false, status: 500 } as any)
          .onSecondCall()
          .resolves({ ok: true, json: async () => expectedMetadata } as any)

        const result = await IPFSModule._fetchMetadataDweb('cid')

        expect(result).to.deep.equal(expectedMetadata)
        expect(stubFetch.calledTwice).to.be.true
      } finally {
        config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
        config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
      }
    })

    it('should return null without retrying on gateway-down statuses (502/503/504)', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      try {
        config.IPFS.METADATA_FETCH_RETRY = 3
        config.IPFS.METADATA_FETCH_DELAY = 0

        const stubFetch = sandbox.stub(global, 'fetch')

        for (const status of [502, 503, 504]) {
          stubFetch.resetHistory()
          stubFetch.resolves({ ok: false, status } as any)

          const result = await IPFSModule._fetchMetadataDweb('cid')

          expect(result).to.be.null
          expect(stubFetch.callCount, `status ${status} should not retry`).to.eq(1)
        }
      } finally {
        config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
        config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
      }
    })
  })

  describe('fetchMetadata', function () {
    it('should race the public gateways when Pinata has no data (CIDv1)', async function () {
      const cidV1 = 'ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(expectedMetadata)
      const stubFetchMetadataDweb = sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      const stubFetchMetadataPinataPublic = sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      const stubFetchMetadataW3s = sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV1)

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.firstCall.args[0]).to.eq('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')
      expect(stubPinataGetData.calledOnce).to.be.true
      expect(stubPinataGetData.firstCall.args[0]).to.eq('bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme')
      expect(stubFetchMetadataDweb.calledOnce).to.be.true
      expect(stubFetchMetadataPinataPublic.calledOnce).to.be.true
      expect(stubFetchMetadataW3s.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should race the public gateways when Pinata has no data (CIDv0)', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example' }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves(expectedMetadata)
      const stubFetchMetadataDweb = sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      const stubFetchMetadataPinataPublic = sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      const stubFetchMetadataW3s = sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubPinataGetData.calledOnce).to.be.true
      expect(stubPinataGetData.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubFetchMetadataDweb.calledOnce).to.be.true
      expect(stubFetchMetadataPinataPublic.calledOnce).to.be.true
      expect(stubFetchMetadataW3s.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should use the dweb.link result when it is the only gateway with the data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from dweb' }

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      const stubFetchMetadataDweb = sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(expectedMetadata)
      const stubFetchMetadataPinataPublic = sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadataDweb.calledOnce).to.be.true
      expect(stubFetchMetadataDweb.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubFetchMetadataPinataPublic.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should use the public Pinata gateway result when it is the only gateway with the data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from public Pinata' }

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const stubFetchMetadataPinataPublic = sandbox
        .stub(IPFSModule, '_fetchMetadataPinataPublic')
        .resolves(expectedMetadata)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadataPinataPublic.calledOnce).to.be.true
      expect(stubFetchMetadataPinataPublic.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should use the nftstorage.link result when it is the only gateway with the data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from nftstorage' }

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      const stubFetchMetadataNftStorage = sandbox
        .stub(IPFSModule, '_fetchMetadataNftStorage')
        .resolves(expectedMetadata)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadataNftStorage.calledOnce).to.be.true
      expect(stubFetchMetadataNftStorage.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should use the w3s.link result when it is the only gateway with the data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from w3s' }

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      const stubFetchMetadataW3s = sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(expectedMetadata)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadataW3s.calledOnce).to.be.true
      expect(stubFetchMetadataW3s.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should not wait for a slow gateway when another already returned the data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from dweb' }

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      // ipfs.io hangs forever — the race must still resolve with the dweb result
      sandbox.stub(IPFSModule, '_fetchMetadata').returns(new Promise(() => {}) as any)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(expectedMetadata)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call fetchMetadata for avatar', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example', avatar: { path: 'test' } }

      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata').resolves({
        name: 'Example',
        avatar: { path: 'test' },
      } as any)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(null)

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubPinataGetData.calledOnce).to.be.true
      expect(stubPinataGetData.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(result?.avatar).to.equal(expectedMetadata.avatar.path)
    })

    it('should return null for invalid CID', async function () {
      const invalidCid = 'ipfs://invalidCID'

      const result = await IPFSModule.fetchMetadata(invalidCid)

      expect(result).to.be.null
    })

    it('should use PinataHelper.getData when it returns data', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example from Pinata' }

      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves(expectedMetadata)
      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata')

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubPinataGetData.calledOnce).to.be.true
      expect(stubPinataGetData.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubFetchMetadata.called).to.be.false
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should handle avatar transformation when avatar exists without path property', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example', avatar: 'directAvatar' }

      const stubPinataGetData = sandbox.stub(PinataHelper, 'getData').resolves({
        name: 'Example',
        avatar: 'directAvatar',
      })
      const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata')

      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(stubPinataGetData.calledOnce).to.be.true
      expect(stubPinataGetData.firstCall.args[0]).to.eq('QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM')
      expect(stubFetchMetadata.called).to.be.false
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call onFetchFailed callback when fetch fails and callback is provided', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const onFetchFailedStub = sandbox.stub().resolves()

      const result = await IPFSModule.fetchMetadata(cidV0, { onFetchFailed: onFetchFailedStub })

      expect(result).to.be.null
      expect(onFetchFailedStub.calledOnceWith(cidV0)).to.be.true
    })

    it('should not call onFetchFailed callback when fetch succeeds', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const expectedMetadata = { name: 'Example' }

      sandbox.stub(PinataHelper, 'getData').resolves(expectedMetadata)
      const onFetchFailedStub = sandbox.stub().resolves()

      const result = await IPFSModule.fetchMetadata(cidV0, { onFetchFailed: onFetchFailedStub })

      expect(result).to.deep.equal(expectedMetadata)
      expect(onFetchFailedStub.called).to.be.false
    })

    it('should handle errors in onFetchFailed callback gracefully', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)
      const onFetchFailedStub = sandbox.stub().rejects(new Error('Callback error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await IPFSModule.fetchMetadata(cidV0, { onFetchFailed: onFetchFailedStub })

      expect(result).to.be.null
      expect(onFetchFailedStub.calledOnce).to.be.true
      expect(loggerErrorStub.args[0][0]).to.eq('Error in onFetchFailed callback')
    })

    it('should not call onFetchFailed callback when callback is not provided', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'

      sandbox.stub(PinataHelper, 'getData').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadata').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataDweb').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataW3s').resolves(null)
      sandbox.stub(IPFSModule, '_fetchMetadataNftStorage').resolves(null)

      // Should not throw when callback is not provided
      const result = await IPFSModule.fetchMetadata(cidV0)

      expect(result).to.be.null
    })

    it('should skip all gateways when total timeout budget is exhausted', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const totalTimeout = config.IPFS.METADATA_FETCH_TOTAL_TIMEOUT

      try {
        config.IPFS.METADATA_FETCH_TOTAL_TIMEOUT = 0

        const stubPinataGetData = sandbox.stub(PinataHelper, 'getData')
        const stubFetchMetadata = sandbox.stub(IPFSModule, '_fetchMetadata')
        const stubFetchMetadataDweb = sandbox.stub(IPFSModule, '_fetchMetadataDweb')
        const stubFetchMetadataPinataPublic = sandbox.stub(IPFSModule, '_fetchMetadataPinataPublic')
        const stubFetchMetadataW3s = sandbox.stub(IPFSModule, '_fetchMetadataW3s')
        const stubFetchMetadataNftStorage = sandbox.stub(IPFSModule, '_fetchMetadataNftStorage')

        const result = await IPFSModule.fetchMetadata(cidV0)

        expect(result).to.be.null
        expect(stubPinataGetData.called).to.be.false
        expect(stubFetchMetadata.called).to.be.false
        expect(stubFetchMetadataDweb.called).to.be.false
        expect(stubFetchMetadataPinataPublic.called).to.be.false
        expect(stubFetchMetadataW3s.called).to.be.false
        expect(stubFetchMetadataNftStorage.called).to.be.false
      } finally {
        config.IPFS.METADATA_FETCH_TOTAL_TIMEOUT = totalTimeout
      }
    })
  })

  describe('_fetchMetadata with HTTP errors', function () {
    it('should return null without retrying on 4xx HTTP response', async () => {
      sandbox.stub(global, 'fetch').resolves({
        ok: false,
        status: 404,
      } as any)

      const result = await IPFSModule._fetchMetadata('cid')

      expect(result).to.be.null
    })

    it('should retry on 5xx HTTP response and succeed on subsequent attempt', async () => {
      const metadatafetchretry = config.IPFS.METADATA_FETCH_RETRY
      const metadatafetchdelay = config.IPFS.METADATA_FETCH_DELAY

      try {
        config.IPFS.METADATA_FETCH_RETRY = 1
        config.IPFS.METADATA_FETCH_DELAY = 0

        const expectedMetadata = { name: 'Success after retry' }
        const stubFetch = sandbox
          .stub(global, 'fetch')
          .onFirstCall()
          .resolves({ ok: false, status: 500 } as any)
          .onSecondCall()
          .resolves({ ok: true, json: async () => expectedMetadata } as any)

        const result = await IPFSModule._fetchMetadata('cid')

        expect(result).to.deep.equal(expectedMetadata)
        expect(stubFetch.calledTwice).to.be.true
      } finally {
        config.IPFS.METADATA_FETCH_RETRY = metadatafetchretry
        config.IPFS.METADATA_FETCH_DELAY = metadatafetchdelay
      }
    })
  })

  describe('_firstNonNull', function () {
    it('should ignore a gateway that throws and still use the one that answered', async () => {
      const result = await IPFSModule._firstNonNull([
        Promise.reject(new Error('gateway is down')),
        Promise.resolve({ name: 'from the healthy gateway' }),
      ])

      expect(result).to.deep.equal({ name: 'from the healthy gateway' })
    })

    it('should return null when every gateway throws', async () => {
      const result = await IPFSModule._firstNonNull([
        Promise.reject(new Error('first is down')),
        Promise.reject(new Error('second is down')),
      ])

      expect(result).to.be.null
    })
  })

  describe('gateway wrappers', function () {
    it('should each read their own gateway uri from config', async () => {
      const stubGateway = sandbox.stub(IPFSModule, '_fetchFromGateway').resolves(null)
      const cid = 'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'

      await IPFSModule._fetchMetadataPinataPublic(cid)
      await IPFSModule._fetchMetadataW3s(cid)
      await IPFSModule._fetchMetadataNftStorage(cid)

      expect(stubGateway.getCall(0).args[1]).to.eq(config.IPFS.PINATA_PUBLIC_GATEWAY_URI)
      expect(stubGateway.getCall(1).args[1]).to.eq(config.IPFS.W3S_GATEWAY_URI)
      expect(stubGateway.getCall(2).args[1]).to.eq(config.IPFS.NFT_STORAGE_GATEWAY_URI)
    })
  })
})
