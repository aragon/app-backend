import config from '@config'
import PinataHelper from '@helpers/pinata'
import utils from '@helpers/utils'
import logger from '@logger'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: Pinata', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getData', async () => {
    it('should get data', async () => {
      const cid = 'QmVGCibCLPgqA8eszxQJMzQFcmQAdrkyhTGH6EB5ERivsR'
      const fakeContent = { data: 1 }
      const stubResponse = {
        json: sandbox.stub().resolves(fakeContent),
      }
      const stubFetch = sandbox.stub(global, 'fetch').resolves(stubResponse as any)

      const resp = await PinataHelper.getData(cid)

      expect(stubFetch.calledOnce).to.be.true
      expect(stubFetch.calledWith(`${config.PINATA.GATEWAY_URI}/${cid}`, { method: 'GET' })).to.be.true
      expect(resp).to.deep.equal(fakeContent)
    })

    it('should handle string data response', async () => {
      const cid = 'QmVGCibCLPgqA8eszxQJMzQFcmQAdrkyhTGH6EB5ERivsR'
      const fakeContent = JSON.stringify({ data: 1 })
      const stubResponse = {
        json: sandbox.stub().resolves(fakeContent),
      }
      const stubFetch = sandbox.stub(global, 'fetch').resolves(stubResponse as any)

      const resp = await PinataHelper.getData(cid)

      expect(stubFetch.calledOnce).to.be.true
      expect(stubFetch.calledWith(`${config.PINATA.GATEWAY_URI}/${cid}`, { method: 'GET' })).to.be.true
      expect(resp).to.deep.equal({ data: 1 })
    })

    it('should handle fetch error', async () => {
      const cid = 'QmVGCibCLPgqA8eszxQJMzQFcmQAdrkyhTGH6EB5ERivsR'
      const stubFetch = sandbox.stub(global, 'fetch').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(logger, 'error')

      const data = await PinataHelper.getData(cid)

      expect(data).to.be.null
      expect(stubFetch.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Pinata failed to fetch data' as any)).to.be.true
    })
  })

  describe('uploadAndPinMetadata', async () => {
    it('should uploadAndPinMetadata', async () => {
      const metadata = {
        name: 'Your DAO Name',
        description: 'Description of your DAO',
        avatar: 'avatar of your DAO',
        stageNames: ['stage1', 'stage2'],
        processKey: 'processKey',
        links: [
          { name: 'Link 1', url: 'https://example.com/link1' },
          { name: 'Link 2', url: 'https://example.com/link2' },
        ],
      }

      const cid = 'xxx'
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'pinJSONToIPFS').resolves({
        IpfsHash: cid,
      } as any)

      const resp = await PinataHelper.uploadAndPinMetadata(metadata)

      expect(resp).to.eq(cid)
      expect(stubPinata.calledOnce).to.be.true
      expect(stubPinata.args[0][0]).to.deep.eq(metadata)
      expect(stubPinata.args[0][1]).to.deep.eq({
        pinataMetadata: {
          name: metadata.name,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      })
    })

    it('should uploadAndPinMetadata with missing params', async () => {
      const metadata = {}
      const random = 'eee'
      const cid = 'xxx'
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'pinJSONToIPFS').resolves({
        IpfsHash: cid,
      } as any)

      const stubRandom = sandbox.stub(utils, 'generateRandomName').returns(random)

      const resp = await PinataHelper.uploadAndPinMetadata(metadata)

      expect(resp).to.eq(cid)
      expect(stubRandom.calledOnce).to.be.true
      expect(stubPinata.calledOnce).to.be.true
      expect(stubPinata.args[0][0]).to.deep.eq({
        name: null,
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
      })
      expect(stubPinata.args[0][1]).to.deep.eq({
        pinataMetadata: {
          name: random,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      })
    })

    it('should fails uploadAndPinMetadata', async () => {
      const metadata = {}
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'pinJSONToIPFS').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(logger, 'error')

      const resp = await PinataHelper.uploadAndPinMetadata(metadata)

      expect(resp).to.eq(null)
      expect(stubPinata.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to upload and pin metadata' as any)).to.be.true
    })
  })

  describe('unPin', async () => {
    it('should unPin', async () => {
      const cid = 'xxx'
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'unpin').resolves(true)

      const resp = await PinataHelper.unPin(cid)

      expect(resp).to.be.true
      expect(stubPinata.calledOnce).to.be.true
      expect(stubPinata.calledWith(cid)).to.be.true
    })

    it('should fails unPin', async () => {
      const cid = 'xxx'
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'unpin').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(logger, 'error')

      const resp = await PinataHelper.unPin(cid)

      expect(resp).to.be.false
      expect(stubPinata.calledOnce).to.be.true
      expect(stubPinata.calledWith(cid)).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to unpin' as any)).to.be.true
    })
  })

  describe('pinList', async () => {
    it('should get pinList', async () => {
      const cid = 'xxx'
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'pinList').resolves({ rows: [{ metadata: 1 }] } as any)

      const resp = await PinataHelper.pinList(cid)

      expect(resp.length).to.eq(1)
      expect(resp[0].metadata).to.eq(1)
      expect(stubPinata.calledOnce).to.be.true
      expect(
        stubPinata.calledWith({
          hashContains: cid,
        }),
      ).to.be.true
    })

    it('should fails get pinList', async () => {
      const stubPinata = sandbox.stub(PinataHelper.pinata, 'pinList').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(logger, 'error')

      const resp = await PinataHelper.pinList()

      expect(resp.length).to.eq(0)
      expect(stubPinata.calledOnce).to.be.true
      expect(stubPinata.calledWith({})).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to fetch pinList' as any)).to.be.true
    })
  })
})
