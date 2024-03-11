import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IPFSHelper from '@helpers/ipfs'
import axios from 'axios'
import { NetworksEnum } from '@types'
import { aragonGateway } from '@helpers/aragonGateway'
import logger from '@logger'

describe('Helpers: IPFS', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('_isValidCIDv0', () => {
    expect(
      IPFSHelper._isValidCIDv0(
        'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM',
      ),
    ).to.be.true
    expect(
      IPFSHelper._isValidCIDv0(
        'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme',
      ),
    ).to.be.false
    expect(IPFSHelper._isValidCIDv0('invalidCID')).to.be.false
  })

  it('_isValidCIDv1', () => {
    expect(
      IPFSHelper._isValidCIDv1(
        'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme',
      ),
    ).to.be.true
    expect(
      IPFSHelper._isValidCIDv1(
        'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM',
      ),
    ).to.be.false
    expect(IPFSHelper._isValidCIDv1('invalidCID')).to.be.false
  })

  it('isValidIpfsUrl', () => {
    expect(
      IPFSHelper.isValidIpfsUrl(
        'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM',
      ),
    ).to.be.true
    expect(
      IPFSHelper.isValidIpfsUrl(
        'ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme',
      ),
    ).to.be.true
    expect(IPFSHelper.isValidIpfsUrl('ipfs://invalidCID')).to.be.false

    expect(IPFSHelper.isValidIpfsUrl(undefined as any)).to.be.false
    expect(IPFSHelper.isValidIpfsUrl('')).to.be.false
    expect(IPFSHelper.isValidIpfsUrl(null as any)).to.be.false
  })

  it('_parseMetadata', () => {
    const metadata = {}
    const resp = IPFSHelper._parseMetadata(metadata)

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
    const resp2 = IPFSHelper._parseMetadata(metadata2 as any)

    expect(resp2.name).to.eq('test')
    expect(resp2.description).to.eq('test')
    expect(resp2.avatar).to.eq('test')
    expect(resp2.links![0]).to.eq('test')
  })

  it('fetchMetadataViaGateway', async () => {
    const cid = 'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
    const network = NetworksEnum.ethereum
    const mockMetadata = {
      name: 'Test Name',
      description: 'Test Description',
      avatar: 'Test Avatar',
      links: ['Test Link'],
    }
    const mockMetadataText = JSON.stringify(mockMetadata)
    const bytes = new TextEncoder().encode(mockMetadataText)

    const catStub = sandbox.stub().returns(Promise.resolve(bytes))

    sandbox
      .stub(aragonGateway, 'getIpfsClient')
      .returns({ cat: catStub } as any)

    const parseMetadataStub = sandbox
      .stub(IPFSHelper, '_parseMetadata')
      .callsFake(metadata => metadata)

    const metadata = await IPFSHelper.fetchMetadataViaGateway(cid, network)

    expect(metadata).to.deep.equal(mockMetadata)
    expect(catStub.calledOnceWithExactly(cid, sinon.match.any)).to.be.true
    expect(parseMetadataStub.calledOnceWithExactly(mockMetadata as any)).to.be
      .true
  })

  it('should warn when fetching metadata via gateway fails', async () => {
    const cid = 'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
    const network = NetworksEnum.ethereum
    const error = new Error('IPFS gateway error')
    sandbox.stub(aragonGateway, 'getIpfsClient').throws(error)
    const loggerWarnStub = sandbox.stub(logger, 'warn')

    const result = await IPFSHelper.fetchMetadataViaGateway(cid, network)

    expect(result).to.be.null
    expect(loggerWarnStub.args[0][0]).to.eq('Cannot fetch or decode metadata')
  })

  it('fetchMetadataViaRequest', async () => {
    const stubReq = sandbox.stub(axios, 'get').returns({ data: 'ok' } as any)
    const stubParseMetadata = sandbox
      .stub(IPFSHelper, '_parseMetadata')
      .returns(true as any)
    const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
    const metadata = await IPFSHelper.fetchMetadataViaRequest(cid)

    expect(metadata).to.be.true
    expect(stubReq.calledOnce).to.be.true
    expect(stubReq.calledWith(`https://ipfs.io/ipfs/${cid}`)).to.be.true
    expect(stubParseMetadata.calledOnce).to.be.true
    expect(stubParseMetadata.calledWith('ok' as any)).to.be.true
  })

  it('should log an error when fetching metadata via request fails', async () => {
    const cid = 'bafkreiinvalidcid'
    const error = new Error('Network error')
    sandbox.stub(axios, 'get').rejects(error)
    const loggerErrorStub = sandbox.stub(logger, 'error')

    const result = await IPFSHelper.fetchMetadataViaRequest(cid)

    expect(result).to.be.null
    expect(loggerErrorStub.args[0][0]).to.eq(
      'Failed to fetch metadata from IPFS',
    )
  })

  describe('fetchMetadata', function () {
    it('should call fetchMetadataViaGateway for CIDv0', async function () {
      const cidV0 = 'ipfs://QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM'
      const network = NetworksEnum.ethereum
      const expectedMetadata = { name: 'Example' }

      const stubV0 = sandbox
        .stub(IPFSHelper, 'fetchMetadataViaGateway')
        .resolves(expectedMetadata)
      sandbox.stub(IPFSHelper, 'fetchMetadataViaRequest').resolves(null)

      const result = await IPFSHelper.fetchMetadata(cidV0, network)

      expect(
        stubV0.calledOnceWithExactly(
          'QmRQuyzUN2EBJAj1cD5WujkrDRhNByD46t4ZorMuvTbuGM',
          network,
        ),
      ).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should call fetchMetadataViaRequest for CIDv1', async function () {
      const cidV1 =
        'ipfs://bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
      const expectedMetadata = { name: 'Example' }

      sandbox.stub(IPFSHelper, 'fetchMetadataViaGateway').resolves(null)
      const stubV1 = sandbox
        .stub(IPFSHelper, 'fetchMetadataViaRequest')
        .resolves(expectedMetadata)

      const result = await IPFSHelper.fetchMetadata(
        cidV1,
        NetworksEnum.ethereum,
      )

      expect(
        stubV1.calledOnceWithExactly(
          'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme',
        ),
      ).to.be.true
      expect(result).to.deep.equal(expectedMetadata)
    })

    it('should return null for invalid CID', async function () {
      const invalidCid = 'ipfs://invalidCID'

      const result = await IPFSHelper.fetchMetadata(
        invalidCid,
        NetworksEnum.ethereum,
      )

      expect(result).to.be.null
    })
  })
})
