import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IAragonContract, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { MetadataHandler } from '@services/indexer/handlers/metadataHandler'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import Web3Helper from '@helpers/web3'

describe('Indexer: MetadataHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('metadataSet', () => {
    it('should store DAO metadata', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: {metadata: 'fake-metadata'},
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves({
        address: '0x123',
        network: NetworksEnum.mainnet
      } as any)

      const decodeHelper = sandbox.stub(Web3Helper, 'extractMetadataUri').returns("ipfs://fake-uri")
      const fetchHelper = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(decodeHelper.calledOnce).to.be.true
      expect(decodeHelper.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(fetchHelper.calledOnce).to.be.true
      expect(fetchHelper.calledWith("ipfs://fake-uri")).to.be.true

    })
  })
})
