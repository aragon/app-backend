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
        args: { metadata: 'fake-metadata' },
      }

      const fakeDecodedTx = {
        data: '0x123',
        contract: IAragonContract.DAOFactory,
        args: [
          {
            subdomain: 'fake-subdomain',
            daoURI: 'fake-daoURI',
            trustedForwarder: 'fake-trustedForwarder',
          },
        ],
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeUri = 'fake-uri'

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseDaoMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(fakeUri)

      expect(stubParseDaoMetadata.calledOnce).to.be.true
      expect(stubParseDaoMetadata.calledWith(fakeMetadata)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogDaoMetadata.findExistingLog(txLog.transactionHash, txLog.address)
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.fetchedMetadata).to.eq(true)
      expect(daoMetadataDB.daoAddress).to.eq(txLog.address)
      expect(daoMetadataDB.trustedForwarder).to.eq(fakeDecodedTx.args[0].trustedForwarder)
      expect(daoMetadataDB.daoURI).to.eq(fakeDecodedTx.args[0].daoURI)
      expect(daoMetadataDB.ens).to.eq(fakeDecodedTx.args[0].subdomain)
      expect(daoMetadataDB.metadataUri).to.eq(fakeUri)
      expect(daoMetadataDB.name).to.eq(fakeMetadata.name)
      expect(daoMetadataDB.description).to.eq(fakeMetadata.description)
      expect(daoMetadataDB.avatar).to.eq(null)
      expect(daoMetadataDB.links.length).to.eq(0)
    })

    it('should store proposal Metadata', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const fakeDecodedTx = {
        data: '0x123',
        contract: IAragonContract.TokenVoting,
        args: [0],
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeUri = 'fake-uri'

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseProposalMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(fakeUri)

      expect(stubParseDaoMetadata.calledOnce).to.be.true
      expect(stubParseDaoMetadata.calledWith(fakeMetadata)).to.be.true

      expect(stubLogger.calledOnce).to.be.true

      const proposalMetadataDB = await Models.LogProposalMetadata.findExistingLog(
        txLog.transactionHash,
        txLog.address,
        fakeDecodedTx.args[0],
      )
      expect(proposalMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(proposalMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(proposalMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(true)
      expect(proposalMetadataDB.pluginAddress).to.eq(txLog.address)
      expect(proposalMetadataDB.proposalId).to.eq(fakeDecodedTx.args[0])
    })

    it('should processLog with missing metadataUri', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const fakeDecodedTx = {
        data: '0x123',
        contract: IAragonContract.TokenVoting,
        args: [0],
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(null)
      const spyFetchMetadata = sandbox.spy(IPFSModule, 'fetchMetadata')
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseProposalMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(spyFetchMetadata.calledOnce).to.be.true
      expect(spyFetchMetadata.args[0][0]).to.eq(null)

      expect(stubParseDaoMetadata.calledOnce).to.be.true
      expect(stubParseDaoMetadata.calledWith(null as any)).to.be.true

      expect(stubLogger.calledOnce).to.be.true

      const proposalMetadataDB = await Models.LogProposalMetadata.findExistingLog(
        txLog.transactionHash,
        txLog.address,
        fakeDecodedTx.args[0],
      )
      expect(proposalMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(proposalMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(proposalMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(false)
      expect(proposalMetadataDB.pluginAddress).to.eq(txLog.address)
      expect(proposalMetadataDB.proposalId).to.eq(fakeDecodedTx.args[0])
    })

    it('should processLog with unknown abi', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const fakeDecodedTx = {
        data: '0x123',
        contract: 'unknown',
        args: [0],
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeUri = 'fake-uri'

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(fakeUri)
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should processLog handle undefined tx data', async () => {
      const fakeMetadata = {
        name: 'test',
        description: 'fake-description',
      }

      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(null as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').resolves()
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubDecodeTx.notCalled).to.be.true
    })

    it('should processLog handle error decode tx', async () => {
      const fakeEvent = {
        args: { metadata: 'fake-metadata' },
      }

      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeTx = { data: '0x123' }
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataHandler, 'decodeTransaction').returns(null as any)
      const networkName = NetworksEnum.mainnet

      await MetadataHandler.metadataSet(fakeEvent as any, txLog, networkName)

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('decodeTransaction', () => {
    it('should decode transaction data', () => {
      const fakeData = '0xabcdabcd' // Example data, adjust according to your contract ABI
      const fakeTransaction = { data: fakeData }
      const mockInterface = {
        getFunction: sandbox.stub().returns({ test: 1 }),
        decodeFunctionData: sandbox.stub().returns(['arg1', 'arg2']),
      }

      MetadataHandler.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataHandler.decodeTransaction(fakeTransaction)
      expect(result).to.deep.include({
        contract: 'ExampleContract',
        args: ['arg1', 'arg2'],
      })
    })

    it('should fail decode transaction data', () => {
      const fakeData = '0xabcdabcd' // Example data, adjust according to your contract ABI
      const stubLogger = sandbox.stub(logger, 'error')
      const fakeTransaction = { data: fakeData }
      const mockInterface = {
        getFunction: sandbox.stub().returns({ test: 1 }),
        decodeFunctionData: sandbox.stub().throws(),
      }

      MetadataHandler.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataHandler.decodeTransaction(fakeTransaction)
      expect(result).to.eq(null)
      expect(stubLogger.calledWith('Metadata decoding error' as any)).to.be.true
    })

    it('should return null if function is not found', () => {
      const fakeTransaction = { data: '0x12345678' }
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInterface = {
        getFunction: sandbox.stub().returns(false),
        decodeFunctionData: sandbox.stub().returns(['arg1', 'arg2']),
      }
      MetadataHandler.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataHandler.decodeTransaction(fakeTransaction)
      expect(result).to.be.null
      expect(stubLogger.calledWith('Metadata not supported' as any)).to.be.true
    })
  })
})
