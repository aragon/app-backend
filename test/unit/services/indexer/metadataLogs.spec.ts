import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import logger from '@logger'
import { IAragonContract, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import Web3Utils from '@helpers/web3'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'
import { Interface } from 'ethers'
import Provider from '@modules/provider'

describe('Indexer: MetadataLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start', async () => {
      let callCount = 0
      const getBlockNumber = sandbox.stub().callsFake(() => {
        callCount++
        return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
      })

      const fakeProviders = {
        mainnet: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
          destroy: sandbox.stub().resolves(),
        },
        sepolia: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
          destroy: sandbox.stub().resolves(),
        },
        polygon: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
          destroy: sandbox.stub().resolves(),
        },
        arbitrum: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
          destroy: sandbox.stub().resolves(),
        },
        base: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
          destroy: sandbox.stub().resolves(),
        },
      }
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(MetadataLogs, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await MetadataLogs.start()

      expect(loggerVerboseStub.callCount).to.eq(6)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should start handle error', async () => {
      let callCount = 0
      const getBlockNumber = sandbox.stub().callsFake(() => {
        callCount++
        return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
      })

      const fakeProviders = {
        mainnet: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
          destroy: sandbox.stub().resolves(),
        },
        sepolia: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
          destroy: sandbox.stub().resolves(),
        },
        polygon: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
          destroy: sandbox.stub().resolves(),
        },
        arbitrum: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
          destroy: sandbox.stub().resolves(),
        },
        base: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
          destroy: sandbox.stub().resolves(),
        },
      }
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(MetadataLogs, 'processLog').rejects()
      const errorStub = sandbox.stub(MetadataLogs, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await MetadataLogs.start()

      expect(errorStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(6)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      await MetadataLogs.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await MetadataLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error MetadataLogs' as any))
  })

  describe('processLog', () => {
    it('should processLog with daoMetadata', async () => {
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
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(MetadataLogs, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseDaoMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processLog(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(
        stubParseLog.calledWith({
          data: txLog.data,
          topics: txLog.topics,
        }),
      ).to.be.true

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

      expect(stubLogger.calledWith('Stored DAO metadata' as any)).to.be.true

      const daoMetadataDB = await Models.LogDaoMetadata.findTxHash(txLog.transactionHash)
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

    it('should processLog with proposalMetadata', async () => {
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
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(MetadataLogs, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const stubParseDaoMetadata = sandbox.stub(Web3Helper, 'parseProposalMetadata').returns(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processLog(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(
        stubParseLog.calledWith({
          data: txLog.data,
          topics: txLog.topics,
        }),
      ).to.be.true

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

      expect(stubLogger.calledWith('Stored proposal metadata' as any)).to.be.true

      const proposalMetadataDB = await Models.LogProposalMetadata.findTxHash(txLog.transactionHash)
      expect(proposalMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(proposalMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(proposalMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(true)
      expect(proposalMetadataDB.daoAddress).to.eq(txLog.address)
      expect(proposalMetadataDB.fetchedMetadata).to.eq(true)
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
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns(fakeDecodedTx as any)
      const stubExtractMetadata = sandbox.stub(MetadataLogs, 'extractMetadataUri').returns(fakeUri)
      const stubFetchMetadata = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeMetadata)
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processLog(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(
        stubParseLog.calledWith({
          data: txLog.data,
          topics: txLog.topics,
        }),
      ).to.be.true

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubExtractMetadata.calledOnce).to.be.true
      expect(stubExtractMetadata.calledWith(fakeEvent.args.metadata)).to.be.true

      expect(stubFetchMetadata.calledOnce).to.be.true
      expect(stubFetchMetadata.args[0][0]).to.eq(fakeUri)

      expect(stubLogger.calledWith('Decoded metadata does not match any expected contract' as any)).to.be.true
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
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(null as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').resolves()
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processLog(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(
        stubParseLog.calledWith({
          data: txLog.data,
          topics: txLog.topics,
        }),
      ).to.be.true

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubDecodeTx.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
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
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const stubGetTx = sandbox.stub(Web3Utils, 'getTransaction').resolves(fakeTx as any)
      const stubDecodeTx = sandbox.stub(MetadataLogs, 'decodeTransaction').returns(null as any)
      const networkName = NetworksEnum.mainnet

      await MetadataLogs.processLog(txLog, networkName)

      expect(stubParseLog.calledOnce).to.be.true
      expect(
        stubParseLog.calledWith({
          data: txLog.data,
          topics: txLog.topics,
        }),
      ).to.be.true

      expect(stubGetTx.calledOnce).to.be.true
      expect(stubGetTx.calledWith(txLog.transactionHash, networkName)).to.be.true

      expect(stubDecodeTx.calledOnce).to.be.true
      expect(stubDecodeTx.calledWith(fakeTx)).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to decode transaction' as any)).to.be.true
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

      MetadataLogs.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataLogs.decodeTransaction(fakeTransaction)
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

      MetadataLogs.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataLogs.decodeTransaction(fakeTransaction)
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
      MetadataLogs.contractInterfaces['ExampleContract'] = mockInterface

      const result = MetadataLogs.decodeTransaction(fakeTransaction)
      expect(result).to.be.null
      expect(stubLogger.calledWith('Metadata not supported' as any)).to.be.true
    })
  })

  describe('extractMetadataUri', () => {
    it('should correctly convert hex string to UTF-8 string', function () {
      const metadataHex = '0x68656c6c6f'
      const result = MetadataLogs.extractMetadataUri(metadataHex)
      expect(result).to.equal('hello')
    })

    it('should handle empty hex strings', function () {
      const result = MetadataLogs.extractMetadataUri('0x')
      expect(result).to.equal('')
    })
  })
})
