import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Helper from '@helpers/web3'
import { ITransactionType, NetworksEnum } from '@types'
import { AbiCoder, Interface } from 'ethers'
import Logger from '@logger'
import logger from '@logger'
import proxyquire from 'proxyquire'
import ProviderModule from '@modules/provider'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it.only('handleAlchemyCrazyBalance', () => {
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
      const stubLoggerError = sandbox.stub(Logger, 'warn')
      const mockAddress = '0x000000000000000000000000006bf71a17584635a5407f6f32f1694ae4328def'
      const expectedFormattedAddress = '0x006bf71A17584635a5407f6F32f1694AE4328def'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format address correctly by removing leading zeros', () => {
      const stubLoggerError = sandbox.stub(Logger, 'warn')
      const mockAddress = '0x000000000000000000000000c1d60f584879f024299da0f19cdb47b931e35b53'
      const expectedFormattedAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(expectedFormattedAddress)
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should format correct address', () => {
      const stubLoggerError = sandbox.stub(Logger, 'warn')
      const mockAddress = '0xc1d60f584879f024299da0f19cdb47b931e35b53'

      const formattedAddress = Web3Helper.formatAddress(mockAddress)
      expect(formattedAddress).to.eq(mockAddress)
      expect(stubLoggerError.calledOnce).to.be.true
    })

    it('should throw error format address', () => {
      const mockInvalidAddress = '0x0000000000000000000000002d594f3c93c19d7b1a6f15b5489ffce4b01f7d0'
      const stubLoggerError = sandbox.stub(Logger, 'warn')

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
      const result = Web3Helper.getERC20TransferABI('0xunsupported')
      expect(result).to.be.null
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
      const loggerStub = sandbox.stub(Logger, 'error')
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
      const loggerStub = sandbox.stub(Logger, 'error')
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
      const stubLogger = sandbox.stub(Logger, 'error')
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
      const stubLogger = sandbox.stub(Logger, 'error')
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
      const loggerError = sandbox.stub(Logger, 'error')
      const result = Web3Helper.extractMetadataUri(undefined as any)
      expect(result).to.equal(null)
      expect(loggerError.calledOnceWith('Error extractMetadataUri' as any)).to.be.true
    })
  })

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

  describe('parseDaoMetadata', () => {
    it('should parseMetadata', () => {
      expect(
        Web3Helper.parseDaoMetadata({
          name: 'test',
          description: 'test',
          avatar: 'test',
          links: [{ name: 'test', url: 'test' }],
        }),
      ).to.deep.equal({
        name: 'test',
        description: 'test',
        avatar: 'test',
        links: [{ name: 'test', url: 'test' }],
      })

      expect(Web3Helper.parseDaoMetadata({})).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
      })

      expect(Web3Helper.parseDaoMetadata(undefined as any)).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
      })
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
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('2000000000000000000') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress])).to.be.true
    })

    it('should return "0" on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0')
      expect(providerStub.send.calledOnce).to.be.true
    })
  })

  describe('getTokenBalances', () => {
    it('should return token balances of an address', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = {
        tokenBalances: [
          { contractAddress: '0xTokenAddress1', tokenBalance: '0x10' }, // 16
          { contractAddress: '0xTokenAddress2', tokenBalance: '0x1a' }, // 26
        ],
      }
      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balances = await Web3Helper.getTokenBalances(fakeAddress, fakeNetwork)
      expect(balances.length).to.equal(2)
      expect(balances[0].tokenBalance).to.equal('16')
      expect(balances[1].tokenBalance).to.equal('26')
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('alchemy_getTokenBalances', [fakeAddress])).to.be.true
    })

    it('should return an empty array on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balances = await Web3Helper.getTokenBalances(fakeAddress, fakeNetwork)
      expect(balances).to.be.an('array').that.is.empty
      expect(providerStub.send.calledOnce).to.be.true
    })
  })

  it('error parseAddress', () => {
    const address = '0xInvalidAddress'
    const stubLogger = sandbox.stub(Logger, 'error')

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
      const stubLogger = sandbox.stub(Logger, 'error')

      const result = Web3Helper.parseAddress(address)

      expect(result).to.equal(expectedChecksumAddress)
      expect(stubLogger.notCalled).to.be.true
    })

    it('error parseAddress', () => {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(Logger, 'error')

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

      sandbox.stub(ProviderModule, 'getProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(expectedTimestamp)
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
    })

    it('should fail getBlockTimestamp', async () => {
      const blockNumber = 123456
      const stubLogger = sandbox.stub(Logger, 'error')
      const stubGetBlock = sandbox.stub().rejects(new Error('fake-error'))
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(0)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
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
      const stubLoggerWarn = sandbox.stub(Logger, 'warn')

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
        '@logger': Logger, // Ensure the real logger is replaced by the stubbed one
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
        '@logger': Logger,
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

      sandbox.stub(ProviderModule, 'getProvider').returns({
        getTransaction: getTransactionStub,
      } as any)

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
    })

    it('should fails getTransaction', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getProvider').returns({
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
      sandbox.stub(ProviderModule, 'getProvider').returns({
        getTransactionReceipt: getTransactionReceiptStubStub,
      } as any)

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(getTransactionReceiptStubStub.calledOnceWith(txHash)).to.be.true
    })

    it('should fails getTransactionReceipt', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionReceiptStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ProviderModule, 'getProvider').returns({
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
      const stubLogger = sandbox.stub(Logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol, decimals: stubDecimals, totalSupply: stubTotalSupply }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        address: '0xTokenAddress',
      })

      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(4)
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
            return { balanceOf: sandbox.stub().resolves('1000') }
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
      expect(balance).to.equal('1000')
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
      expect(balance).to.equal('0')
    })
  })

  it('should get the the dao version', async () => {
    const stubConfigState = {
      getConfigItem: sandbox.stub().returns({}),
    }

    const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
      ethers: {
        Contract: function () {
          return { protocolVersion: sandbox.stub().resolves([1, 0, 1]) }
        },
      },
      '@state/configState': {
        ConfigState: { getInstance: () => stubConfigState },
      },
    })

    const result = await MockedWeb3Helper.getDaoOsVersion('0xDaoAddress', NetworksEnum.ethereumMainnet)

    expect(result).to.equal('1.0.1')
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
      const stubLogger = sandbox.stub(Logger, 'error')

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
      const stubLogger = sandbox.stub(Logger, 'error')

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

      sandbox.stub(ProviderModule, 'getProvider').returns({
        send: providerSendStub,
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

      sandbox.stub(ProviderModule, 'getProvider').returns({
        send: providerSendStub,
      } as any)

      const params = {
        address: '0x36466a17feead01870e2781f608ccbffc9977081',
        blockNumber: 123456,
        tokenAddress: '0x84DaD4E4A4d1510052D39e916330372db8cD1238',
        network: NetworksEnum.ethereumMainnet,
      }

      const loggerWarnStub = sandbox.stub(Logger, 'error')

      const returnedValue = await Web3Helper.getTokenBalanceAtBlock(params)
      expect(returnedValue).to.equal('0')
      expect(providerSendStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnceWith('Error getErc20BalanceAtBlock' as any)).to.be.true
    })
  })
})
