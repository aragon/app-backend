import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Helper from '@helpers/web3'
import { ITransactionType, NetworksEnum } from '@types'
import { AbiCoder, Interface } from 'ethers'
import logger from '@logger'
import proxyquire from 'proxyquire'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import BigNumber from 'bignumber.js'
import BottleneckModule from '@modules/bottleneck'
import config from '@config'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('handleAlchemyCrazyBalance', () => {
    it('handleAlchemyCrazyBalance', () => {
      expect(Web3Helper.handleAlchemyCrazyBalance('7.326e+22', 18)).to.equal('73260.0')
      expect(Web3Helper.handleAlchemyCrazyBalance('0', 18)).to.equal('0')
      expect(Web3Helper.handleAlchemyCrazyBalance('50000000000000000', 18)).to.equal('50000000000000000')
      expect(Web3Helper.handleAlchemyCrazyBalance('0.01', 18)).to.equal('0.01')
      expect(Web3Helper.handleAlchemyCrazyBalance(0.01, 18)).to.equal('0.01')
      expect(Web3Helper.handleAlchemyCrazyBalance('1.73462724372438', 18)).to.equal('1.73462724372438')
      expect(Web3Helper.handleAlchemyCrazyBalance(1.73462724372438, 18)).to.equal('1.73462724372438')
      expect(Web3Helper.handleAlchemyCrazyBalance(4.2e-16, 18)).to.equal('0.000000000000000420')
      expect(Web3Helper.handleAlchemyCrazyBalance('4.2e-16', 18)).to.equal('0.000000000000000420')
      expect(
        Web3Helper.handleAlchemyCrazyBalance('0x0000000000000000000000000000000000000000000000000000000000124f80', 18),
      ).to.equal('0.0000000000012')
      expect(Web3Helper.handleAlchemyCrazyBalance('43943983483908340948.438934780934834409', 18)).to.equal(
        '43943983483908340948.438934780934834409',
      )
    })

    it('should log an error when amount is a string without "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '12345' // Invalid format (should be hex)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Web3Helper.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.calledOnceWith('Error alchemyCrazyBalance wrong format' as any)).to.be.true
    })

    it('should not log an error when amount includes "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '0x12345' // Correct hex format
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Web3Helper.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should not log an error when amount is not a string', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = 12345 // Numeric value (valid)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Web3Helper.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should handle undefined amount gracefully without logging an error', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = undefined // Undefined value
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Web3Helper.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })
  })

  describe('Constants', () => {
    it('should have correct ERC1155_INTERFACE_ID', () => {
      expect(Web3Helper.ERC1155_INTERFACE_ID).to.equal('0xd9b67a26')
    })

    it('should have correct ERC165_INTERFACE_ID', () => {
      expect(Web3Helper.ERC165_INTERFACE_ID).to.equal('0x01ffc9a7')
    })

    it('should have correct ERC721_INTERFACE_ID', () => {
      expect(Web3Helper.ERC721_INTERFACE_ID).to.equal('0x80ac58cd')
    })

    it('should have correct INTERFACE_ID_INVALID', () => {
      expect(Web3Helper.INTERFACE_ID_INVALID).to.equal('0xffffffff')
    })

    it('should have correct onERC721Received', () => {
      expect(Web3Helper.onERC721Received).to.equal('0x150b7a02')
    })

    it('should have correct onERC1155Received', () => {
      expect(Web3Helper.onERC1155Received).to.equal('0xf23a6e61')
    })

    it('should have correct onERC1155BatchReceived', () => {
      expect(Web3Helper.onERC1155BatchReceived).to.equal('0xbc197c81')
    })

    it('should have correct ERC721_safeTransferFromNoData', () => {
      expect(Web3Helper.ERC721_safeTransferFromNoData).to.equal('0x42842e0e')
    })

    it('should have correct ERC721_safeTransferFromWithData', () => {
      expect(Web3Helper.ERC721_safeTransferFromWithData).to.equal('0xb88d4fde')
    })

    it('should have correct ERC721_transferFrom', () => {
      expect(Web3Helper.ERC721_transferFrom).to.equal('0x23b872dd')
    })

    it('should have correct ERC20_transfer', () => {
      expect(Web3Helper.ERC20_transfer).to.equal('0xa9059cbb')
    })

    it('should have correct ERC20_transferFrom', () => {
      expect(Web3Helper.ERC20_transferFrom).to.equal('0x23b872dd')
    })

    it('should have correct ERC1155_safeTransferFrom', () => {
      expect(Web3Helper.ERC1155_safeTransferFrom).to.equal('0xf242432a')
    })

    it('should have correct ERC1155_safeBatchTransferFrom', () => {
      expect(Web3Helper.ERC1155_safeBatchTransferFrom).to.equal('0x2eb2c2d6')
    })
  })

  describe('formatAddress', () => {
    it('should format address correctly', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0x000000000000000000000000006bf71a17584635a5407f6f32f1694ae4328def'
      const expectedFormattedAddress = '0x006bf71A17584635a5407f6F32f1694AE4328def'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format address correctly by removing leading zeros', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0x000000000000000000000000c1d60f584879f024299da0f19cdb47b931e35b53'
      const expectedFormattedAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format correct address', () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const mockAddress = '0xc1d60f584879f024299da0f19cdb47b931e35b53'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(mockAddress)
      expect(stubLoggerError.calledOnce).to.be.true
    })

    it('should throw error format address', () => {
      const mockInvalidAddress = '0x0000000000000000000000002d594f3c93c19d7b1a6f15b5489ffce4b01f7d0'
      const stubLoggerError = sandbox.stub(logger, 'warn')

      const formattedAddress = Web3Helper.formatAddress(mockInvalidAddress)

      expect(formattedAddress).to.eq('0x0000000000000000000000002d594f3c93c19d7b1a6f15b5489ffce4b01f7d0')
      expect(stubLoggerError.calledOnce).to.be.true
    })
  })

  describe('getERC20TransferABI', () => {
    it('should return correct ABI for ERC20_transfer', () => {
      const result = Web3Helper.getERC20TransferABI(Web3Helper.ERC20_transfer)
      expect(result).to.deep.equal(['address', 'uint256'])
    })

    it('should return correct ABI for ERC20_transferFrom', () => {
      const result = Web3Helper.getERC20TransferABI(Web3Helper.ERC20_transferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Helper.getERC20TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledWith('Unsupported function selector' as any)).to.be.true
    })
  })

  describe('getERC721TransferABI', () => {
    it('should return correct ABI for ERC721_transferFrom', () => {
      const result = Web3Helper.getERC721TransferABI(Web3Helper.ERC721_transferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return correct ABI for ERC721_safeTransferFromNoData', () => {
      const result = Web3Helper.getERC721TransferABI(Web3Helper.ERC721_safeTransferFromNoData)
      expect(result).to.deep.equal(['address', 'address', 'uint256'])
    })

    it('should return correct ABI for ERC721_safeTransferFromNoData', () => {
      const result = Web3Helper.getERC721TransferABI(Web3Helper.ERC721_safeTransferFromWithData)
      expect(result).to.deep.equal(['address', 'address', 'uint256', 'bytes'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Helper.getERC721TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      loggerStub.restore()
    })
  })

  describe('getERC1155TransferABI', () => {
    it('should return correct ABI for ERC1155_safeTransferFrom', () => {
      const result = Web3Helper.getERC1155TransferABI(Web3Helper.ERC1155_safeTransferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256', 'uint256', 'bytes'])
    })

    it('should return correct ABI for ERC1155_safeBatchTransferFrom', () => {
      const result = Web3Helper.getERC1155TransferABI(Web3Helper.ERC1155_safeBatchTransferFrom)
      expect(result).to.deep.equal(['address', 'address', 'uint256[]', 'uint256[]', 'bytes'])
    })

    it('should return null for unsupported function selector', () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const result = Web3Helper.getERC1155TransferABI('0xunsupported')
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      loggerStub.restore()
    })
  })

  it('needToSyncBlockTime', () => {
    expect(Web3Helper.needToSyncBlockTime({})).to.be.true
    expect(Web3Helper.needToSyncBlockTime({ blockTimestamp: 0 })).to.be.true
    expect(Web3Helper.needToSyncBlockTime({ blockTimestamp: 1 })).to.be.false
  })

  it('isERC1155TransferMethod', () => {
    const action = { data: Web3Helper.ERC1155_safeTransferFrom }
    sandbox.stub(Web3Helper, 'getMethodSignature').returns(Web3Helper.ERC1155_safeTransferFrom)

    const result = Web3Helper.isERC1155TransferMethod(action)

    expect(result).to.be.true
  })

  it('isERC721Transfer', () => {
    const action = { data: Web3Helper.ERC721_transferFrom }
    sandbox.stub(Web3Helper, 'getMethodSignature').returns(Web3Helper.ERC721_transferFrom)

    const result = Web3Helper.isERC721Transfer(action)

    expect(result).to.be.true
  })

  it('isERC20Transfer', () => {
    const action = { data: Web3Helper.ERC20_transfer }
    sandbox.stub(Web3Helper, 'getMethodSignature').returns(Web3Helper.ERC20_transfer)

    const result = Web3Helper.isERC20Transfer(action)

    expect(result).to.be.true
  })

  it('isNativeTokenAction', () => {
    const action = { data: '0x', value: 1n }

    const result = Web3Helper.isNativeTokenAction(action)

    expect(result).to.be.true
  })

  it('convertToHexNumber', () => {
    expect(Web3Helper.convertToHexNumber(1)).to.eq('0x1')
    expect(Web3Helper.convertToHexNumber(0)).to.eq('0x0')
    expect(Web3Helper.convertToHexNumber(undefined as any)).to.eq(undefined)
  })

  describe('supportsERC721', () => {
    it('should return true if the contract supports ERC721', async () => {
      const supportsInterfaceStub = sandbox.stub(Web3Helper, 'supportsInterface').resolves(true)
      supportsInterfaceStub.onFirstCall().resolves(true)
      supportsInterfaceStub.onSecondCall().resolves(true)
      supportsInterfaceStub.onThirdCall().resolves(false)

      const result = await Web3Helper.supportsERC721('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC165_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC721_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Helper.INTERFACE_ID_INVALID,
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

      const result = await Web3Helper.supportsERC1155('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC165_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC1155_INTERFACE_ID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Helper.INTERFACE_ID_INVALID,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.true
    })
  })

  describe('supportsInterface', () => {
    it('supportsInterface', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSupportsInterface = sandbox.stub().resolves(true)
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { supportsInterface: stubSupportsInterface }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.supportsInterface(
        '0xTokenAddress',
        '0xInterfaceId',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.true
    })

    it('supportsInterface', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSupportsInterface = sandbox.stub().rejects(new Error('fake-error'))
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { supportsInterface: stubSupportsInterface }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.supportsInterface(
        '0xTokenAddress',
        '0xInterfaceId',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.false
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

      const result = Web3Helper.decodeCalldata(decodeABI, calldata)

      expect(result).to.deep.equal(decodedData)
    })

    it('should return null if decoding fails', () => {
      const decodeABI = ['address', 'uint256']
      const calldata = 'invalidcalldata'

      sandbox.stub(AbiCoder, 'defaultAbiCoder').returns({
        decode: sandbox.stub().throws(new Error('decode error')),
      } as any)

      const result = Web3Helper.decodeCalldata(decodeABI, calldata)

      expect(result).to.be.null
    })
  })

  it('parseERC721Action', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', 123]
    const result = Web3Helper.parseERC721Action(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenId: '123',
    })
  })

  it('parseERC1155Action', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', 123n, 22n]
    const result = Web3Helper.parseERC1155Action(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenId: '123',
      amount: 22,
    })
  })

  it('parseERC1155BatchAction', () => {
    const decoded = ['0xfromAddress', '0xtoAddress', [123n, 90n], [1n, 1n]]
    const result = Web3Helper.parseERC1155BatchAction(decoded)

    expect(result).to.deep.equal({
      from: '0xfromAddress',
      to: '0xtoAddress',
      tokenIds: ['123', '90'],
      amounts: [1, 1],
    })
  })

  describe('parseERC20TransferAction', () => {
    it('parseERC20TransferAction ERC20_transfer', () => {
      const functionSelector = Web3Helper.ERC20_transfer
      const decoded = ['0xtoAddress', 1000n]
      const txLog = { address: '0xfromAddress' }
      const result = Web3Helper.parseERC20TransferAction(functionSelector, decoded, txLog as any)

      expect(result).to.deep.equal({
        from: '0xfromAddress',
        to: '0xtoAddress',
        amount: 1000,
      })
    })

    it('parseERC20TransferAction ERC20_transferFrom', () => {
      const functionSelector = Web3Helper.ERC20_transferFrom
      const decoded = ['0xfromAddress', '0xtoAddress', 1000n]
      const txLog = { address: '0xfromAddress' }
      const result = Web3Helper.parseERC20TransferAction(functionSelector, decoded, txLog as any)

      expect(result).to.deep.equal({
        from: '0xfromAddress',
        to: '0xtoAddress',
        amount: 1000,
      })
    })
  })

  describe('getActionTransactionType', () => {
    it('should return externalTransfer if neither from nor to is daoAddress', () => {
      const from = '0xfromAddress'
      const to = '0xtoAddress'
      const daoAddress = '0xdaoAddress'

      const result = Web3Helper.getActionTransactionType(from, to, daoAddress)

      expect(result).to.equal(ITransactionType.externalTransfer)
    })

    it('should return deposit if from is not daoAddress and to is daoAddress', () => {
      const from = '0xfromAddress'
      const to = '0xdaoAddress'
      const daoAddress = '0xdaoAddress'

      const result = Web3Helper.getActionTransactionType(from, to, daoAddress)

      expect(result).to.equal(ITransactionType.deposit)
    })

    it('should return withdraw if from is daoAddress and to is not daoAddress', () => {
      const from = '0xdaoAddress'
      const to = '0xtoAddress'
      const daoAddress = '0xdaoAddress'

      const result = Web3Helper.getActionTransactionType(from, to, daoAddress)

      expect(result).to.equal(ITransactionType.withdraw)
    })
  })

  it('getMethodSignature', () => {
    const data = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    const result = Web3Helper.getMethodSignature(data)

    expect(result).to.equal('0xabcdef12')
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

      const result = Web3Helper.findLogsByName(txReceipt as any, 'EventName', abi)

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

      const result = Web3Helper.findLogsByName(txReceipt, 'EventName', abi)

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

      const result = Web3Helper.findLogsByName(txReceipt, 'EventName', abi)

      expect(result).to.deep.equal([])
      expect(stubLogger.calledOnceWith('Error parse eventTopicHash' as any)).to.be.true
    })
  })

  describe('extractMetadataUri', () => {
    it('should correctly convert hex string to UTF-8 string', function () {
      const metadataHex = '0x68656c6c6f'
      const result = Web3Helper.extractMetadataUri(metadataHex)
      expect(result).to.equal('hello')
    })

    it('should handle empty hex strings', function () {
      const result = Web3Helper.extractMetadataUri('0x')
      expect(result).to.equal('')
    })

    it('should handle error in hex strings', function () {
      const loggerError = sandbox.stub(logger, 'error')
      const result = Web3Helper.extractMetadataUri(undefined as any)
      expect(result).to.equal(null)
      expect(loggerError.calledOnceWith('Error extractMetadataUri' as any)).to.be.true
    })
  })

  it('should parseLog with info data', function () {
    const txLog = {
      transactionHash: '0x123',
      address: '0xce01f8eee7E479C928F8919abD53E553a36CeF67',
      data: '0x789',
      topics: ['0xabc'],
      transactionIndex: 1,
      index: 1,
      blockNumber: 1,
    }

    const fakeEvent = {
      name: 'MetadataSet',
      args: true,
    }

    const network = NetworksEnum.ethereumMainnet

    const result = Web3Helper.parseInfoLog(txLog, fakeEvent.name, network)

    expect(result.network).to.eq(network)
    expect(result.blockNumber).to.eq(txLog.blockNumber)
    expect(result.transactionHash).to.eq(txLog.transactionHash)
    expect(result.eventName).to.eq(fakeEvent.name)
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

      const result = Web3Helper.parseLog(txLog as any, iFace)!

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

      const result = Web3Helper.parseLog(txLog as any, iFace)

      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.null
    })
  })

  describe('Web3Helper.parseDaoMetadata', () => {
    it('should parse metadata correctly', () => {
      expect(
        Web3Helper.parseDaoMetadata({
          name: 'test',
          description: 'test description',
          avatar: 'test-avatar-url',
          links: [{ name: 'test-link', url: 'https://test.com' }],
          stageNames: ['Stage 1', 'Stage 2'],
          processKey: 'process-key-123',
        }),
      ).to.deep.equal({
        name: 'test',
        description: 'test description',
        avatar: 'test-avatar-url',
        links: [{ name: 'test-link', url: 'https://test.com' }],
        stageNames: ['Stage 1', 'Stage 2'],
        processKey: 'process-key-123',
      })

      expect(Web3Helper.parseDaoMetadata({})).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
      })

      expect(Web3Helper.parseDaoMetadata(undefined as any)).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
        stageNames: [],
        processKey: null,
      })

      expect(
        Web3Helper.parseDaoMetadata({
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
      })

      expect(
        Web3Helper.parseDaoMetadata({
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
      })
    })
  })

  describe('getChainAdjustedBlockNumber', () => {
    it('should return the same block number if network is not Arbitrum', async () => {
      const blockNumber = 123456
      const result = await Web3Helper.getChainAdjustedBlockNumber(blockNumber, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(blockNumber)
    })

    it('should return L1 block number on Arbitrum successfully', async () => {
      const arbBlock = 987654
      const l1Block = 555555
      const iface = new Interface(['function getL1BlockNumber() view returns (uint256)'])
      const encodedResponse = iface.encodeFunctionResult('getL1BlockNumber', [BigInt(l1Block)])
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ call: sandbox.stub().resolves(encodedResponse) })
      sandbox
        .stub(BottleneckModule, 'getAlchemyBalanceLimiter')
        .returns({ schedule: sandbox.stub().resolves(encodedResponse) } as any)

      const result = await Web3Helper.getChainAdjustedBlockNumber(arbBlock, NetworksEnum.arbitrumMainnet)
      expect(result).to.equal(l1Block - 1)
    })

    it('should return the original Arbitrum block number and log an error if an exception occurs', async () => {
      const arbBlock = 987654
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(new Error('fake error'))
      const stubLogger = sandbox.stub(logger, 'error')

      const result = await Web3Helper.getChainAdjustedBlockNumber(arbBlock, NetworksEnum.arbitrumMainnet)
      expect(result).to.equal(arbBlock)
      expect(stubLogger.calledOnceWith('Error getBlockNumberOnArbitrum' as any)).to.be.true
    })
  })

  describe('getBalance', () => {
    it('should return the balance of an address', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = '0x1bc16d674ec80000' // 2 ETH in wei

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns({
        decimals: 18,
      } as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('2.0') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress, 'latest'])).to.be.true
    })

    it('should return "0" when token is not saved', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = '0x1bc16d674ec80000' // 2 ETH in wei

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns(false as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress, 'latest'])).to.be.true
    })

    it('should return "0" on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0')

      expect(errorLoggerStub.calledOnce).to.be.true
      expect(providerStub.send.calledOnce).to.be.true
    })
  })

  it('error parseAddress', () => {
    const address = '0xInvalidAddress'
    const stubLogger = sandbox.stub(logger, 'error')

    const result = Web3Helper.parseAddress(address)

    expect(result).to.be.null
    expect(stubLogger.calledWith('Error checksum address' as any)).to.be.true
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

      const parsed = Web3Helper.parseProposalMetadata(proposalMetadata)

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

      const parsed = Web3Helper.parseProposalMetadata(incompleteMetadata)

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
      const parsed = Web3Helper.parseProposalMetadata(undefined as any)

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

      const result = Web3Helper.parseAddress(address)

      expect(result).to.equal(expectedChecksumAddress)
      expect(stubLogger.notCalled).to.be.true
    })

    it('error parseAddress', () => {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(logger, 'error')

      const result = Web3Helper.parseAddress(address)

      expect(result).to.be.null
      expect(stubLogger.calledWith('Error checksum address' as any)).to.be.true
    })
  })

  describe('getBlockTimestamp', () => {
    it('should getBlockTimestamp', async () => {
      const blockNumber = 123456
      const expectedTimestamp = 1615551010 // Example Unix timestamp
      const stubGetBlock = sandbox.stub().resolves({ timestamp: expectedTimestamp })
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(expectedTimestamp)
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
    })

    it('should fail getBlockTimestamp', async () => {
      const blockNumber = 123456
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetBlock = sandbox.stub().rejects(new Error('fake-error'))
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(0)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
    })
  })

  describe('getLogs', () => {
    it('should getBlockTimestamp', async () => {
      const stubGetLogs = sandbox.stub().resolves(true)
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getLogs: stubGetLogs,
      } as any)

      const filter = {
        fromBlock: '0x760d40',
        toBlock: '0x760d40',
        topics: [
          [
            '0x62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3',
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        ],
      }

      const res = await Web3Helper.getLogs(filter, NetworksEnum.ethereumMainnet)

      expect(res).to.be.true
      expect(stubGetLogs.calledOnceWith(filter)).to.be.true
    })

    it('should fail getLogs', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetLogs = sandbox.stub().rejects(new Error('fake-error'))
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getLogs: stubGetLogs,
      } as any)

      const filter = {
        fromBlock: '0x760d40',
        toBlock: '0x760d40',
        topics: [
          [
            '0x62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3',
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        ],
      }

      const res = await Web3Helper.getLogs(filter, NetworksEnum.ethereumMainnet)

      expect(res).to.be.null
      expect(stubLogger.calledOnce).to.be.true
      expect(stubGetLogs.calledOnceWith(filter)).to.be.true
    })
  })

  describe('subdomainExists', () => {
    it('should check if subdomainExists', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubRecordExistsStub = sandbox.stub().resolves(true)
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { recordExists: stubRecordExistsStub }
          },
          namehash: () => {
            return '0xb9b3537ea1117f65799f21b36bbc6357724953d5bf9cca09f0757b7ac3e81f37'
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const ensName = 'aavegotchi.dao.eth'
      const result = await MockedWeb3Helper.subdomainExists(ensName, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(stubRecordExistsStub.calledOnce).to.be.true
    })

    it('should log an error if checking ENS existence fails', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const error = new Error('Contract call failed')
      const stubRecordExistsStub = sandbox.stub().rejects(error)
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: () => {
            return { recordExists: stubRecordExistsStub }
          },
          namehash: () => {
            return '0xb9b3537ea1117f65799f21b36bbc6357724953d5bf9cca09f0757b7ac3e81f37'
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
        '@logger': logger, // Ensure the real logger is replaced by the stubbed one
      })

      const ensName = 'aavegotchi.dao.eth'
      const result = await MockedWeb3Helper.subdomainExists(ensName, NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
      expect(stubLoggerWarn.calledOnce).to.be.true
      expect(stubLoggerWarn.calledWith('Error subdomainExists' as any)).to.be.true
    })

    it('should return false if not supported', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: () => {
            return {}
          },
          namehash: () => {
            return '0xb9b3537ea1117f65799f21b36bbc6357724953d5bf9cca09f0757b7ac3e81f37'
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
        '@logger': logger,
      })

      const ensName = 'aavegotchi.dao.eth'
      const result = await MockedWeb3Helper.subdomainExists(ensName, NetworksEnum.arbitrumMainnet)

      expect(result).to.be.false
      expect(stubConfigState.getConfigItem.notCalled).to.be.true
    })
  })

  describe('getTransaction', () => {
    it('should getTransaction successfully', async () => {
      const txHash = '0x0'
      const getTransactionStub = sandbox.stub().resolves(true)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransaction: getTransactionStub,
      } as any)

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
    })

    it('should fails getTransaction', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(logger, 'error')
      const getTransactionStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransaction: getTransactionStub,
      } as any)

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(getTransactionStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction' as any)).to.be.true
    })
  })

  describe('getTransactionReceipt', () => {
    it('should getTransactionReceipt successfully', async () => {
      const txHash = '0x0'
      const getTransactionReceiptStubStub = sandbox.stub().resolves(true)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: getTransactionReceiptStubStub,
      } as any)

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(getTransactionReceiptStubStub.calledOnceWith(txHash)).to.be.true
    })

    it('should fails getTransactionReceipt', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(logger, 'error')
      const getTransactionReceiptStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: getTransactionReceiptStub,
      } as any)

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction receipt' as any)).to.be.true
    })
  })

  describe('getTokenInfo', () => {
    it('should return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().resolves('Test Token')
      const stubSymbol = sandbox.stub().resolves('TST')
      const stubDecimals = sandbox.stub().resolves(18n)
      const stubTotalSupply = sandbox.stub().resolves(200n)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol, decimals: stubDecimals, totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        address: '0xTokenAddress',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 18,
        totalSupply: '200',
      })

      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
    })

    it('should fails return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().rejects(new Error('Test Error'))
      const stubSymbol = sandbox.stub().rejects(new Error('Test Error'))
      const stubDecimals = sandbox.stub().rejects(new Error('Test Error'))
      const stubTotalSupply = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol, decimals: stubDecimals, totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        decimals: '0',
        address: '0xTokenAddress',
      })

      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(4)
    })
  })

  describe('getTokenNameAndSymbol', () => {
    it('should return token name and symbol', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().resolves('Test Token')
      const stubSymbol = sandbox.stub().resolves('TST')
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenNameAndSymbol('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({
        name: 'Test Token',
        symbol: 'TST',
      })
      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
    })

    it('should fails return token name and symbol', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().rejects(new Error('Test Error'))
      const stubSymbol = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenNameAndSymbol('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({
        name: null,
        symbol: null,
      })
      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(2)
    })
  })

  describe('getERC20Balance', () => {
    it('should return the ERC20 balance of an address', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { balanceOf: sandbox.stub().resolves(1000n) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const fakeTokenAddress = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const balance = await MockedWeb3Helper.getERC20Balance(fakeAddress, fakeTokenAddress, fakeNetwork)
      expect(balance).to.equal(1000n)
    })

    it('should return "0" on error ERC20', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { balanceOf: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const fakeTokenAddress = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const balance = await MockedWeb3Helper.getERC20Balance(fakeTokenAddress, fakeAddress, fakeNetwork)
      expect(balance).to.equal(0n)
    })
  })

  describe('getDaoOsVersion', () => {
    it('should return the DAO OS version when protocolVersion is available', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubProtocolVersion = sandbox.stub().resolves([2, 3, 4]) // Mocked protocol version

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { protocolVersion: stubProtocolVersion }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getDaoOsVersion('0xDaoAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('2.3.4')
      expect(stubProtocolVersion.calledOnce).to.be.true
    })

    it('should return default version "1.0.0" if protocolVersion call fails', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubProtocolVersion = sandbox.stub().rejects(new Error('fake-error'))

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { protocolVersion: stubProtocolVersion }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getDaoOsVersion('0xDaoAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('1.0.0') // Default fallback version
      expect(stubProtocolVersion.calledOnce).to.be.true
    })
  })

  describe('getDataFromTxReceipt', () => {
    it('should getDataFromTxReceipt', async () => {
      const stubTransactionReceipt = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const stubFindLogsByName = sandbox.stub(Web3Helper, 'findLogsByName').returns([1] as any)

      const params = {
        txLog: { transactionHash: '0x0' },
        eventName: 'test',
        abi: '',
        network: NetworksEnum.ethereumMainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params as any)

      expect(result.txReceipt).to.be.true
      expect(result.events[0]).to.eq(1)
      expect(stubFindLogsByName.calledOnceWith(true as any, params.eventName, params.abi)).to.be.true
      expect(stubTransactionReceipt.calledOnceWith(params.txLog.transactionHash, params.network)).to.be.true
    })

    it('should getDataFromTxReceipt - Failed to find txReceipt', async () => {
      const stubTransactionReceipt = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(false as any)
      const stubLogger = sandbox.stub(logger, 'error')

      const params = {
        txLog: { transactionHash: '0x0' },
        eventName: 'test',
        abi: '',
        network: NetworksEnum.ethereumMainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params as any)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to find txReceipt' as any)).to.be.true
      expect(result).to.be.undefined
      expect(stubTransactionReceipt.calledOnceWith(params.txLog.transactionHash, params.network)).to.be.true
    })

    it('should getDataFromTxReceipt - Failed to find event', async () => {
      const stubTransactionReceipt = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const stubFindLogsByName = sandbox.stub(Web3Helper, 'findLogsByName').returns([] as any)
      const stubLogger = sandbox.stub(logger, 'error')

      const params = {
        txLog: { transactionHash: '0x0' },
        eventName: 'test',
        abi: '',
        network: NetworksEnum.ethereumMainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params as any)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to find event' as any)).to.be.true
      expect(result).to.be.undefined
      expect(stubTransactionReceipt.calledOnceWith(params.txLog.transactionHash, params.network)).to.be.true
      expect(stubFindLogsByName.calledOnceWith(true as any, params.eventName, params.abi)).to.be.true
    })
  })

  describe('getTokenBalanceAtBlock', () => {
    it('should get the token balance at a specific block', async () => {
      const providerSendStub = sandbox.stub().resolves('0x' + ''.padStart(63, '0') + 1)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        call: providerSendStub,
      } as any)

      const result = await Web3Helper.getTokenBalanceAtBlock({
        address: '0x36466a17feead01870e2781f608ccbffc9977081',
        blockNumber: 123456,
        tokenAddress: '0x84DaD4E4A4d1510052D39e916330372db8cD1238',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.equal('1')
    })

    it('should throw error if the provider fails', async () => {
      const providerSendStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        call: providerSendStub,
      } as any)

      const params = {
        address: '0x36466a17feead01870e2781f608ccbffc9977081',
        blockNumber: 123456,
        tokenAddress: '0x84DaD4E4A4d1510052D39e916330372db8cD1238',
        network: NetworksEnum.ethereumMainnet,
      }

      const loggerWarnStub = sandbox.stub(logger, 'error')

      const returnedValue = await Web3Helper.getTokenBalanceAtBlock(params)
      expect(returnedValue).to.equal('0')
      expect(providerSendStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnceWith('Error getErc20BalanceAtBlock' as any)).to.be.true
    })
  })

  describe('convertBalanceToUsd', () => {
    it('should convert balance to USD', async () => {
      const response = Web3Helper.convertBalanceToUsd('123213', '2.1', 18)

      expect(response).to.equal('258747.30')
    })

    it('should return "0" on error', async () => {
      sandbox.stub(BigNumber.prototype, 'multipliedBy').throws(new Error('fake-error'))
      const loggerStub = sandbox.stub(logger, 'error')
      const response = Web3Helper.convertBalanceToUsd('123213', '2.1', 'a' as any)
      expect(response).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('isMultisigMemberAtBlock', () => {
    it('should check if the user is member of multisig at certain block', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListedAtBlock: sandbox.stub().resolves(true) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const multisigPlugin = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const stat = await MockedWeb3Helper.isMultisigMemberAtBlock(multisigPlugin, fakeAddress, 123, fakeNetwork)
      expect(stat).to.equal(true)
    })

    it('should return false when  ERC20', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListedAtBlock: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      sandbox.stub(logger, 'error')
      const multisigPlugin = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const stat = await MockedWeb3Helper.isMultisigMemberAtBlock(multisigPlugin, fakeAddress, 123, fakeNetwork)
      expect(stat).to.equal(false)
    })
  })

  describe('getBLockReceipts', () => {
    it('should return the block receipts with logs', async () => {
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = []

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      await Web3Helper.getBlockReceipts(fakeNetwork, 12321)
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBlockReceipts', [`0x${(12321).toString(16)}`])).to.be.true
    })

    it('should throw error if the provider fails', async () => {
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerSendStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        send: providerSendStub,
      } as any)

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const returnedValue = await Web3Helper.getBlockReceipts(fakeNetwork, 12321)
      expect(returnedValue).to.be.null
      expect(providerSendStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error getBlockReceipts' as any)).to.be.true
    })
  })

  describe('getTargetConfig', () => {
    it('should return false when error getting target config', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getTargetConfig: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')
      const plugin = '0xTokenAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getTargetConfig(plugin, fakeNetwork)
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should return the target config', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              getTargetConfig: sandbox.stub().resolves({
                target: '0xsomeaddress',
              }),
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const plugin = '0xTokenAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getTargetConfig(plugin, fakeNetwork)
      expect(result).to.be.equal('0xsomeaddress')
    })
  })

  describe('getBlockNumber', () => {
    it('should return latest block number when blockNumber is "latest"', async () => {
      const network = NetworksEnum.ethereumMainnet
      const expectedBlockNumber = 123456
      const providerStub = {
        getBlockNumber: sandbox.stub().resolves(expectedBlockNumber),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)

      const blockNumber = await Web3Helper.getBlockNumber('latest', network)
      expect(blockNumber).to.equal(expectedBlockNumber)
    })

    it('should return -1 when provider call fails', async () => {
      const network = NetworksEnum.ethereumMainnet
      const providerStub = {
        getBlockNumber: sandbox.stub().rejects(new Error('Provider error')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const blockNumber = await Web3Helper.getBlockNumber('latest', network)
      expect(blockNumber).to.equal(-1)
      expect(loggerStub.calledOnceWith('Error getBlockNumber' as any)).to.be.true
    })

    it('should return the provided block number when blockNumber is a valid number', async () => {
      const blockNumber = 1000
      const result = await Web3Helper.getBlockNumber(blockNumber, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(blockNumber)
    })

    it('should return -1 when provider is undefined', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(undefined)
      const loggerStub = sandbox.stub(logger, 'error')

      const blockNumber = await Web3Helper.getBlockNumber('latest', NetworksEnum.ethereumMainnet)
      expect(blockNumber).to.equal(-1)
      expect(loggerStub.calledOnceWith('Error getBlockNumber' as any)).to.be.true
    })
  })

  describe('getBlock', () => {
    it('should return the block data when provider call succeeds', async () => {
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 123456
      const mockBlockData = { number: blockNumber, hash: '0xabc' }

      const providerStub = {
        getBlock: sandbox.stub().resolves(mockBlockData),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)

      const block = await Web3Helper.getBlock(blockNumber, network)
      expect(block).to.deep.equal(mockBlockData)
    })

    it('should return null when provider call fails', async () => {
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 123456

      const providerStub = {
        getBlock: sandbox.stub().rejects(new Error('Provider error')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const block = await Web3Helper.getBlock(blockNumber, network)
      expect(block).to.be.null
      expect(loggerStub.calledOnceWith('Error getBlock' as any)).to.be.true
    })

    it('should return null when provider is undefined', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(undefined)
      const loggerStub = sandbox.stub(logger, 'error')

      const block = await Web3Helper.getBlock(123456, NetworksEnum.ethereumMainnet)
      expect(block).to.be.null
      expect(loggerStub.calledOnceWith('Error getBlock' as any)).to.be.true
    })
  })

  describe('isWhitelistedToken', () => {
    it('should return true if the token is whitelisted', () => {
      const address = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address, network }])

      const result = Web3Helper.isWhitelistedToken(address, network)
      expect(result).to.be.true
    })

    it('should return false if the token is not whitelisted', () => {
      const address = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address: '0xDifferentToken', network }])

      const result = Web3Helper.isWhitelistedToken(address, network)
      expect(result).to.be.false
    })

    it('should return false if the token is in the whitelist but for a different network', () => {
      const address = '0xTokenAddress'

      sandbox.stub(config, 'WHITELIST_TOKENS').value([{ address, network: NetworksEnum.polygonMainnet }])

      const result = Web3Helper.isWhitelistedToken(address, NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should return false if the whitelist is empty', () => {
      sandbox.stub(config, 'WHITELIST_TOKENS').value([])

      const result = Web3Helper.isWhitelistedToken('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })
  })

  describe('getTokenTotalSupply', () => {
    it('should getTokenTotalSupply', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubTotalSupply = sandbox.stub().resolves(200n)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenTotalSupply('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(200n)
      expect(stubTotalSupply.calledOnce).to.be.true
    })

    it('should fails return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubTotalSupply = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenTotalSupply('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(0n)
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error getting token total supply' as any)).to.be.true
    })
  })

  describe('getMultisigSettings', () => {
    it('should getMultisigSettings', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSettings = sandbox.stub().resolves({ minApprovals: 1n, isListed: true })

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { multisigSettings: stubSettings }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getMultisigSettings('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result.minApprovals).to.eq(1n)
      expect(result.isListed).to.eq(true)
      expect(stubSettings.calledOnce).to.be.true
    })

    it('should fails return multisig settings', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSettings = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { multisigSettings: stubSettings }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getMultisigSettings('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(undefined)
      expect(stubSettings.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error getting multisig settings' as any)).to.be.true
    })
  })

  describe('getVotingToken', () => {
    it('should return the voting token address successfully', async () => {
      const stubVotingToken = sandbox.stub().resolves('0xVotingTokenAddress')
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getVotingToken: stubVotingToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getVotingToken(fakePluginAddress, fakeNetwork)

      expect(result).to.equal('0xVotingTokenAddress')
      expect(stubVotingToken.calledOnce).to.be.true
    })

    it('should return null if fetching voting token address fails', async () => {
      const stubVotingToken = sandbox.stub().rejects(new Error('fake-error'))
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getVotingToken: stubVotingToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getVotingToken(fakePluginAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubVotingToken.calledOnce).to.be.true
    })
  })

  describe('getVotingEscrowAddress', () => {
    it('should return the voting escrow address successfully', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const expectedEscrowAddress = '0xEscrowAddress'

      stubEscrow.resolves(expectedEscrowAddress)

      const result = await MockedWeb3Helper.getVotingEscrowAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.equal(expectedEscrowAddress)
      expect(stubEscrow.calledOnce).to.be.true
    })

    it('should return null if fetching escrow address fails', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      stubEscrow.rejects(new Error('fake-error'))

      const result = await MockedWeb3Helper.getVotingEscrowAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubEscrow.calledOnce).to.be.true
    })
  })

  describe('getVotingEscrowAddress', () => {
    it('should return the lock token address successfully', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakeEscrowAddress = '0xEscrowAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const expectedLockTokenAddress = '0xLockTokenAddress'

      stubLockNFT.resolves(expectedLockTokenAddress)

      const result = await MockedWeb3Helper.getLockTokenAddress(fakeEscrowAddress, fakeNetwork)

      expect(result).to.equal(expectedLockTokenAddress)
      expect(stubLockNFT.calledOnce).to.be.true
    })

    it('should return null if fetching lock token address fails', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakeEscrowAddress = '0xEscrowAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      stubLockNFT.rejects(new Error('fake-error'))

      const result = await MockedWeb3Helper.getLockTokenAddress(fakeEscrowAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubLockNFT.calledOnce).to.be.true
    })
  })

  describe('getUnderlying', () => {
    it('should return the underlying address when the call is successful', async () => {
      const stubUnderlying = sandbox.stub().resolves('0xUnderlyingAddress')
      const fakeProvider = {}
      // Use proxyquire to override dependencies:
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          // When a new Contract is created, return an object with our stubbed underlying function.
          Contract: function () {
            return { underlying: stubUnderlying }
          },
        },
        ProviderModule: {
          getAnyRpcProvider: () => fakeProvider,
        },
      })

      const result = await MockedWeb3Helper.getUnderlying('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal('0xUnderlyingAddress')
      expect(stubUnderlying.calledOnce).to.be.true
    })

    it('should return null and log a warning when the underlying call fails', async () => {
      const stubUnderlying = sandbox.stub().rejects(new Error('Underlying error'))
      const fakeProvider = {}
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { underlying: stubUnderlying }
          },
        },
        ProviderModule: {
          getAnyRpcProvider: () => fakeProvider,
        },
      })

      const result = await MockedWeb3Helper.getUnderlying('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(stubUnderlying.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.firstCall.args[0]).to.equal('Error getting underlying')
    })
  })
})
