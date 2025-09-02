import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITransactionType, NetworksEnum } from '@types'
import { AbiCoder, Interface } from 'ethers'
import logger from '@logger'
import BigNumber from 'bignumber.js'
import config from '@config'
import Web3Utils from '@helpers/web3Utils'
import Web3Helper from '@helpers/web3'

describe('Helpers:Web3Utils', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Constants', () => {
    it('should have correct ERC1155_INTERFACE_ID', () => {
      expect(Web3Utils.ERC1155_INTERFACE_ID).to.equal('0xd9b67a26')
    })

    it('should have correct ERC165_INTERFACE_ID', () => {
      expect(Web3Utils.ERC165_INTERFACE_ID).to.equal('0x01ffc9a7')
    })

    it('should have correct ERC721_INTERFACE_ID', () => {
      expect(Web3Utils.ERC721_INTERFACE_ID).to.equal('0x80ac58cd')
    })

    it('should have correct INTERFACE_ID_INVALID', () => {
      expect(Web3Utils.INTERFACE_ID_INVALID).to.equal('0xffffffff')
    })

    it('should have correct onERC721Received', () => {
      expect(Web3Utils.onERC721Received).to.equal('0x150b7a02')
    })

    it('should have correct onERC1155Received', () => {
      expect(Web3Utils.onERC1155Received).to.equal('0xf23a6e61')
    })

    it('should have correct onERC1155BatchReceived', () => {
      expect(Web3Utils.onERC1155BatchReceived).to.equal('0xbc197c81')
    })

    it('should have correct ERC721_safeTransferFromNoData', () => {
      expect(Web3Utils.ERC721_safeTransferFromNoData).to.equal('0x42842e0e')
    })

    it('should have correct ERC721_safeTransferFromWithData', () => {
      expect(Web3Utils.ERC721_safeTransferFromWithData).to.equal('0xb88d4fde')
    })

    it('should have correct ERC721_transferFrom', () => {
      expect(Web3Utils.ERC721_transferFrom).to.equal('0x23b872dd')
    })

    it('should have correct ERC20_transfer', () => {
      expect(Web3Utils.ERC20_transfer).to.equal('0xa9059cbb')
    })

    it('should have correct ERC20_transferFrom', () => {
      expect(Web3Utils.ERC20_transferFrom).to.equal('0x23b872dd')
    })

    it('should have correct ERC1155_safeTransferFrom', () => {
      expect(Web3Utils.ERC1155_safeTransferFrom).to.equal('0xf242432a')
    })

    it('should have correct ERC1155_safeBatchTransferFrom', () => {
      expect(Web3Utils.ERC1155_safeBatchTransferFrom).to.equal('0x2eb2c2d6')
    })
  })

  describe('formatAddress', () => {
    it('should format address correctly', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0x000000000000000000000000006bf71a17584635a5407f6f32f1694ae4328def'
      const expectedFormattedAddress = '0x006bf71A17584635a5407f6F32f1694AE4328def'

      const formattedAddress = Web3Utils.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format address correctly by removing leading zeros', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0x000000000000000000000000c1d60f584879f024299da0f19cdb47b931e35b53'
      const expectedFormattedAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'

      const formattedAddress = Web3Utils.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format correct address', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0xc1d60f584879f024299da0f19cdb47b931e35b53'

      const formattedAddress = Web3Utils.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(mockAddress)
      expect(stubLoggerError.calledOnce).to.be.true
    })

    it('should throw error format address', () => {
      const mockInvalidAddress = '0x0000000000000000000000002d594f3c93c19d7b1a6f15b5489ffce4b01f7d0'
      const stubLoggerError = sandbox.stub(logger, 'warn')

      const formattedAddress = Web3Utils.formatAddress(mockInvalidAddress)

      expect(formattedAddress).to.eq('0x0000000000000000000000002d594f3c93c19d7b1a6f15b5489ffce4b01f7d0')
      expect(stubLoggerError.calledOnce).to.be.true
    })
  })

  describe('getERC20TransferABI', () => {
    it('should return correct ABI for ERC20_transfer', () => {
      const result = Web3Utils.getERC20TransferABI(Web3Utils.ERC20_transfer)
      expect(result).to.deep.equal(['address', 'uint256'])
    })

    it('should return correct ABI for ERC20_transferFrom', () => {
      const result = Web3Utils.getERC20TransferABI(Web3Utils.ERC20_transferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Utils.getERC20TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledWith('Unsupported function selector' as any)).to.be.true
    })
  })

  describe('getERC721TransferABI', () => {
    it('should return correct ABI for ERC721_transferFrom', () => {
      const result = Web3Utils.getERC721TransferABI(Web3Utils.ERC721_transferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return correct ABI for ERC721_safeTransferFromNoData', () => {
      const result = Web3Utils.getERC721TransferABI(Web3Utils.ERC721_safeTransferFromNoData)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return correct ABI for ERC721_safeTransferFromNoData', () => {
      const result = Web3Utils.getERC721TransferABI(Web3Utils.ERC721_safeTransferFromWithData)
      expect(result).to.deep.equal(['address', 'address', 'uint256', 'bytes'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Utils.getERC721TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      loggerStub.restore()
    })
  })

  describe('getERC1155TransferABI', () => {
    it('should return correct ABI for ERC1155_safeTransferFrom', () => {
      const result = Web3Utils.getERC1155TransferABI(Web3Utils.ERC1155_safeTransferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256', 'uint256', 'bytes'])
    })

    it('should return correct ABI for ERC1155_safeBatchTransferFrom', () => {
      const result = Web3Utils.getERC1155TransferABI(Web3Utils.ERC1155_safeBatchTransferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256[]', 'uint256[]', 'bytes'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Utils.getERC1155TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      loggerStub.restore()
    })
  })

  it('isERC1155TransferMethod', () => {
    const action = { data: Web3Utils.ERC1155_safeTransferFrom }
    sandbox.stub(Web3Utils, 'getMethodSignature').returns(Web3Utils.ERC1155_safeTransferFrom)

    const result = Web3Utils.isERC1155TransferMethod(action)

    expect(result).to.be.true
  })

  it('isERC721Transfer', () => {
    const action = { data: Web3Utils.ERC721_transferFrom }
    sandbox.stub(Web3Utils, 'getMethodSignature').returns(Web3Utils.ERC721_transferFrom)

    const result = Web3Utils.isERC721Transfer(action)

    expect(result).to.be.true
  })

  it('isERC20Transfer', () => {
    const action = { data: Web3Utils.ERC20_transfer }
    sandbox.stub(Web3Utils, 'getMethodSignature').returns(Web3Utils.ERC20_transfer)

    const result = Web3Utils.isERC20Transfer(action)

    expect(result).to.be.true
  })

  it('isNativeTokenAction', () => {
    const action = { data: '0x', value: 1n }

    const result = Web3Utils.isNativeTokenAction(action)

    expect(result).to.be.true
  })

  describe('isWhitelistedToken', () => {
    it('should return true if the token is whitelisted', () => {
      const address = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address, network }])

      const result = Web3Utils.isWhitelistedToken(address, network)
      expect(result).to.be.true
    })

    it('should return false if the token is not whitelisted', () => {
      const address = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address: '0xDifferentToken', network }])

      const result = Web3Utils.isWhitelistedToken(address, network)
      expect(result).to.be.false
    })

    it('should return false if the token is in the whitelist but for a different network', () => {
      const address = '0xTokenAddress'

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address, network: NetworksEnum.polygonMainnet }])

      const result = Web3Utils.isWhitelistedToken(address, NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should return false if the whitelist is empty', () => {
      sandbox.stub(config, 'WHITELIST_TOKENS').value([])

      const result = Web3Utils.isWhitelistedToken('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })
  })

  it('needToSyncBlockTime', () => {
    expect(Web3Utils.needToSyncBlockTime({})).to.be.true
    expect(Web3Utils.needToSyncBlockTime({ blockTimestamp: 0 })).to.be.true
    expect(Web3Utils.needToSyncBlockTime({ blockTimestamp: 1 })).to.be.false
  })

  describe('supportsERC721', () => {
    it('should return true if the contract supports ERC721', async () => {
      const supportsInterfaceStub = sandbox.stub(Web3Helper, 'supportsInterface').resolves(true)
      supportsInterfaceStub.onFirstCall().resolves(true)
      supportsInterfaceStub.onSecondCall().resolves(true)
      supportsInterfaceStub.onThirdCall().resolves(false)

      const result = await Web3Utils.supportsERC721('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Utils.ERC165_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Utils.ERC721_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Utils.INTERFACE_ID_INVALID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })
  })

  describe('supportsERC1155', () => {
    it('should return true if the contract supports ERC1155', async () => {
      const supportsInterfaceStub = sandbox.stub(Web3Helper, 'supportsInterface')
      supportsInterfaceStub.onFirstCall().resolves(true)
      supportsInterfaceStub.onSecondCall().resolves(true)
      supportsInterfaceStub.onThirdCall().resolves(false)

      const result = await Web3Utils.supportsERC1155('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Utils.ERC165_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Utils.ERC1155_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Utils.INTERFACE_ID_INVALID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })
  })

  describe('decodeCalldata', () => {
    it('should correctly decode calldata', () => {
      const decodeABI = ['address', 'uint256']
      const calldata =
        '0x000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef0000000000000000000000000000000000000000000000000000000000000042'

      const decodedData = ['0x0000000000000000000000001234567890abcdef1234567890abcdef1234567890abcdef', 66]
      sandbox.stub(AbiCoder, 'defaultAbiCoder').returns({
        decode: sandbox.stub().returns(decodedData),
      } as any)

      const result = Web3Utils.decodeCalldata(decodeABI, calldata)

      expect(result).to.deep.equal(decodedData)
    })

    it('should return null if decoding fails', () => {
      const decodeABI = ['address', 'uint256']
      const calldata = 'invalidcalldata'

      sandbox.stub(AbiCoder, 'defaultAbiCoder').returns({
        decode: sandbox.stub().throws(new Error('decode error')),
      } as any)

      const result = Web3Utils.decodeCalldata(decodeABI, calldata)

      expect(result).to.be.null
    })
  })

  it('parseERC721Action', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', 123]
    const result = Web3Utils.parseERC721Action(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenId: '123',
    })
  })

  it('parseERC1155Action', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', 123n, 22n]
    const result = Web3Utils.parseERC1155Action(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenId: '123',
      amount: 22,
    })
  })

  it('parseERC1155BatchAction', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', [123n, 90n], [1n, 1n]]
    const result = Web3Utils.parseERC1155BatchAction(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenIds: ['123', '90'],
      amounts: [1, 1],
    })
  })

  describe('parseERC20TransferAction', () => {
    it('parseERC20TransferAction ERC20_transfer', () => {
      const functionSelector = Web3Utils.ERC20_transfer
      const decoded = ['0xtoAddress', 1000n]
      const txLog = { address: '0xfromAddress' }
      const result = Web3Utils.parseERC20TransferAction(functionSelector, decoded, txLog as any)

      expect(result).to.deep.equal({
        from: '0xfromAddress',
        to: '0xtoAddress',
        amount: 1000,
      })
    })

    it('parseERC20TransferAction ERC20_transferFrom', () => {
      const functionSelector = Web3Utils.ERC20_transferFrom
      const decoded = ['0xfromAddress', '0xtoAddress', 1000n]
      const txLog = { address: '0xfromAddress' }
      const result = Web3Utils.parseERC20TransferAction(functionSelector, decoded, txLog as any)

      expect(result).to.deep.equal({
        from: '0xfromAddress',
        to: '0xtoAddress',
        amount: 1000,
      })
    })
  })

  it('getMethodSignature', () => {
    const data = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    const result = Web3Utils.getMethodSignature(data)

    expect(result).to.equal('0xabcdef12')
  })

  describe('extractMetadataUri', () => {
    it('should correctly convert hex string to UTF-8 string', function () {
      const metadataHex = '0x68656c6c6f'
      const result = Web3Utils.extractMetadataUri(metadataHex)
      expect(result).to.equal('hello')
    })

    it('should handle empty hex strings', function () {
      const result = Web3Utils.extractMetadataUri('0x')
      expect(result).to.equal('')
    })

    it('should handle error in hex strings', function () {
      const loggerError = sandbox.stub(logger, 'error')
      const result = Web3Utils.extractMetadataUri(undefined as any)
      expect(result).to.equal(null)
      expect(loggerError.calledOnceWith('Error extractMetadataUri' as any)).to.be.true
    })
  })

  describe('convertBalanceToUsd', () => {
    it('should convert balance to USD', async () => {
      const response = Web3Utils.convertBalanceToUsd('123213', '2.1', 18)

      expect(response).to.equal('258747.30')
    })

    it('should return "0" on error', async () => {
      sandbox.stub(BigNumber.prototype, 'multipliedBy').throws(new Error('fake-error'))
      const loggerStub = sandbox.stub(logger, 'error')
      const response = Web3Utils.convertBalanceToUsd('123213', '2.1', 'a' as any)
      expect(response).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('parseLog', () => {
    it('should parseLog with info data', function () {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const fakeEvent = {
        name: 'MetadataSet',
        args: true,
      }

      const iFace = {
        parseLog: sandbox.stub().returns(fakeEvent as any),
      }

      const result = Web3Utils.parseLog(txLog as any, iFace)!

      expect(result.name).to.eq(fakeEvent.name)
      expect(result.args).to.eq(fakeEvent.args)
    })

    it('should fail parseLog', function () {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const loggerStub = sandbox.stub(logger, 'error')
      const iFace = {
        parseLog: sandbox.stub().throws(new Error('fake-error')),
      }

      const result = Web3Utils.parseLog(txLog as any, iFace)

      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.null
    })
  })

  describe('findLogsByName', () => {
    it('should find and parse logs by event name', () => {
      const txReceipt = {
        to: '',
        from: '',
        transactionHash: '',
        logs: [
          {
            blockNumber: 0,
            blockHash: '',
            transactionIndex: 0,
            removed: false,
            address: '',
            data: '',
            topics: ['0xeventTopicHash'],
            transactionHash: '',
            logIndex: 0,
          },
        ],
        blockNumber: 0,
      }

      const abi = [
        {
          type: 'event',
          name: 'EventName',
          inputs: [],
        },
      ]

      const eventTopicHash = '0xeventTopicHash'
      const parsedLog = { name: 'parsedLog' } as any

      sandbox.stub(Interface.prototype, 'getEvent').returns({ topicHash: eventTopicHash } as any)
      sandbox.stub(Interface.prototype, 'parseLog').returns(parsedLog)

      const result = Web3Utils.findLogsByName(txReceipt as any, 'EventName', abi)

      expect(result).to.deep.equal([
        {
          parsed: parsedLog,
          txLog: txReceipt.logs[0],
        },
      ])
    })

    it('should return an empty array if eventTopicHash not found', () => {
      const stubLogger = sandbox.stub(logger, 'error')
      const txReceipt: any = {
        to: '',
        from: '',
        transactionHash: '',
        logs: [],
      }

      const abi = [
        {
          type: 'event',
          name: 'EventName',
          inputs: [],
        },
      ]

      sandbox.stub(Interface.prototype, 'getEvent').returns([] as any)

      const result = Web3Utils.findLogsByName(txReceipt, 'EventName', abi)

      expect(result).to.deep.equal([])
      expect(stubLogger.calledOnceWith('Error eventTopicHash not found' as any)).to.be.true
    })

    it('should return an empty array and log an error if an exception occurs', () => {
      const stubLogger = sandbox.stub(logger, 'error')
      const txReceipt: any = {
        to: '',
        from: '',
        transactionHash: '',
        logs: [],
      }

      const abi = [
        {
          type: 'event',
          name: 'EventName',
          inputs: [],
        },
      ]

      sandbox.stub(Interface.prototype, 'getEvent').throws(new Error('Test Error'))

      const result = Web3Utils.findLogsByName(txReceipt, 'EventName', abi)

      expect(result).to.deep.equal([])
      expect(stubLogger.calledOnceWith('Error parse eventTopicHash' as any)).to.be.true
    })
  })

  describe('parseCampaignMetadata', () => {
    it('should parse metadata correctly', () => {
      const metadata = {
        title: 'Campaign 1',
        description: 'Description of Campaign 1',
        type: 'https://avatar.campaign1',
        resources: [{ name: 'Link 1', url: 'https://link1.com' }],
      }

      const parsed = Web3Utils.parseCampaignMetadata(metadata)

      expect(parsed).to.deep.equal({
        title: 'Campaign 1',
        description: 'Description of Campaign 1',
        type: 'https://avatar.campaign1',
        resources: [{ name: 'Link 1', url: 'https://link1.com' }],
      })

      expect(Web3Utils.parseCampaignMetadata({})).to.deep.equal({
        title: null,
        description: null,
        type: null,
        resources: [],
      })

      expect(Web3Utils.parseCampaignMetadata(undefined as any)).to.deep.equal({
        title: null,
        description: null,
        type: null,
        resources: [],
      })
    })
  })

  describe('parseDaoMetadata', () => {
    it('should parse metadata correctly', () => {
      expect(
        Web3Utils.parseDaoMetadata({
          name: 'test',
          description: 'test description',
          avatar: 'test-avatar-url',
          links: [{ name: 'test-link', url: 'https://test.com' }],
          stageNames: ['Stage 1', 'Stage 2'],
          processKey: 'process-key-123',
          blockedCountries: ['US', 'CA'],
          enableOfacCheck: true,
        }),
      ).to.deep.equal({
        name: 'test',
        description: 'test description',
        avatar: 'test-avatar-url',
        links: [{ name: 'test-link', url: 'https://test.com' }],
        stageNames: ['Stage 1', 'Stage 2'],
        processKey: 'process-key-123',
        blockedCountries: ['US', 'CA'],
        enableOfacCheck: true,
        termsConditionsUrl: null,
      })

      expect(Web3Utils.parseDaoMetadata({})).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        termsConditionsUrl: null,
        enableOfacCheck: null,
        blockedCountries: [],
      })

      expect(Web3Utils.parseDaoMetadata(undefined as any)).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        termsConditionsUrl: null,
        enableOfacCheck: null,
        blockedCountries: [],
      })

      expect(
        Web3Utils.parseDaoMetadata({
          name: 'DAO Test',
          description: null,
          avatar: null,
          links: [],
          stageNames: [],
          processKey: null,
        }),
      ).to.deep.equal({
        name: 'DAO Test',
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
        termsConditionsUrl: null,
        enableOfacCheck: null,
        blockedCountries: [],
      })

      expect(
        Web3Utils.parseDaoMetadata({
          name: 'DAO Test 2',
          description: 'Description for DAO',
          avatar: 'https://avatar.test',
          links: [],
          stageNames: ['Stage A', 'Stage B'],
          processKey: 'process-key-456',
        }),
      ).to.deep.equal({
        name: 'DAO Test 2',
        description: 'Description for DAO',
        avatar: 'https://avatar.test',
        links: [],
        stageNames: ['Stage A', 'Stage B'],
        processKey: 'process-key-456',
        termsConditionsUrl: null,
        enableOfacCheck: null,
        blockedCountries: [],
      })
    })
  })

  describe('parseProposalMetadata', () => {
    it('should parse proposal metadata correctly', () => {
      const proposalMetadata = {
        title: 'Proposal 1',
        summary: 'Summary of Proposal 1',
        description: 'Detailed description of Proposal 1',
        resources: [{ name: 'test', url: 'https://localhost' }],
        media: {
          header: 'headerImage.png',
          logo: 'logoImage.png',
        },
      }

      const parsed = Web3Utils.parseProposalMetadata(proposalMetadata)

      expect(parsed).to.deep.equal({
        title: 'Proposal 1',
        summary: 'Summary of Proposal 1',
        description: 'Detailed description of Proposal 1',
        resources: [{ name: 'test', url: 'https://localhost' }],
        media: {
          header: 'headerImage.png',
          logo: 'logoImage.png',
        },
      })
    })

    it('should handle incomplete proposal metadata', () => {
      const incompleteMetadata = {
        title: 'Incomplete Proposal',
        summary: null,
        description: null,
        resources: [],
        media: {
          header: null,
          logo: null,
        },
      }

      const parsed = Web3Utils.parseProposalMetadata(incompleteMetadata)

      expect(parsed).to.deep.equal({
        title: 'Incomplete Proposal',
        summary: null,
        description: null,
        resources: [],
        media: {
          header: null,
          logo: null,
        },
      })
    })

    it('should handle undefined proposal metadata', () => {
      const parsed = Web3Utils.parseProposalMetadata(undefined as any)

      expect(parsed).to.deep.equal({
        title: null,
        summary: null,
        description: null,
        resources: [],
        media: {
          header: null,
          logo: null,
        },
      })
    })
  })

  describe('parseAddress', () => {
    it('should parseAddress', () => {
      const address = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
      const expectedChecksumAddress = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
      const stubLogger = sandbox.stub(logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.equal(expectedChecksumAddress)
      expect(stubLogger.notCalled).to.be.true
    })

    it('error parseAddress', () => {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.be.null
      expect(stubLogger.calledWith('Error checksum address' as any)).to.be.true
    })
  })

  it('convertToHexNumber', () => {
    expect(Web3Utils.convertToHexNumber(1)).to.eq('0x1')
    expect(Web3Utils.convertToHexNumber(0)).to.eq('0x0')
    expect(Web3Utils.convertToHexNumber(undefined as any)).to.eq(undefined)
  })

  it('parseDaoMetadata', () => {
    const metadata = {}
    const resp = Web3Utils.parseDaoMetadata(metadata)

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
    const resp2 = Web3Utils.parseDaoMetadata(metadata2 as any)

    expect(resp2.name).to.eq('test')
    expect(resp2.description).to.eq('test')
    expect(resp2.avatar).to.eq('test')
    expect(resp2.links![0]).to.eq('test')
  })
})
