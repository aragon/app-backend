import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Helper from '@helpers/web3'
import { ITransactionType, NetworksEnum } from '@types'
import { AbiCoder, Interface } from 'ethers'
import { ConfigState } from '@state/configState'
import Logger from '@logger'
import proxyquire from 'proxyquire'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
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

  it('should format address correctly by removing leading zeros', () => {
    const mockAddress = '0x0000000000a6379f8c30e6544866d9dbb2df6800fc2dbe3899'
    const expectedFormattedAddress = '0xa6379f8c30e6544866d9dbb2df6800fc2dbe3899'

    const formattedAddress = Web3Helper.formatAddress(mockAddress)
    expect(formattedAddress).to.eq(expectedFormattedAddress)
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

  it('convertToHoxNumber', () => {
    expect(Web3Helper.convertToHoxNumber(1)).to.eq('0x1')
    expect(Web3Helper.convertToHoxNumber(0)).to.eq('0x0')
    expect(Web3Helper.convertToHoxNumber(undefined as any)).to.eq(undefined)
  })

  describe('supportsERC721', () => {
    it('should return true if the contract supports ERC721', async () => {
      const supportsInterfaceStub = sandbox.stub(Web3Helper, 'supportsInterface').resolves(true)
      supportsInterfaceStub.onFirstCall().resolves(true)
      supportsInterfaceStub.onSecondCall().resolves(true)
      supportsInterfaceStub.onThirdCall().resolves(false)

      const result = await Web3Helper.supportsERC721('0xTokenAddress', NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC165_INTERFACE_ID,
          NetworksEnum.mainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC721_INTERFACE_ID,
          NetworksEnum.mainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Helper.INTERFACE_ID_INVALID,
          NetworksEnum.mainnet,
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

      const result = await Web3Helper.supportsERC1155('0xTokenAddress', NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(supportsInterfaceStub.callCount).to.equal(3)
      expect(
        supportsInterfaceStub.firstCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC165_INTERFACE_ID,
          NetworksEnum.mainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.secondCall.calledWith(
          '0xTokenAddress',
          Web3Helper.ERC1155_INTERFACE_ID,
          NetworksEnum.mainnet,
        ),
      ).to.be.true
      expect(
        supportsInterfaceStub.thirdCall.calledWith(
          '0xTokenAddress',
          Web3Helper.INTERFACE_ID_INVALID,
          NetworksEnum.mainnet,
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

      const result = await MockedWeb3Helper.supportsInterface('0xTokenAddress', '0xInterfaceId', NetworksEnum.mainnet)

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

      const result = await MockedWeb3Helper.supportsInterface('0xTokenAddress', '0xInterfaceId', NetworksEnum.mainnet)

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
      const result = Web3Helper.parseERC20TransferAction(functionSelector, decoded, txLog)

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
      const result = Web3Helper.parseERC20TransferAction(functionSelector, decoded, txLog)

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
      const fakeNetwork = NetworksEnum.mainnet
      const fakeResponse = '0x1bc16d674ec80000' // 2 ETH in wei

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => providerStub } as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('2000000000000000000') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress])).to.be.true
    })

    it('should return "0" on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.mainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => providerStub } as any)

      const balance = await Web3Helper.getBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0')
      expect(providerStub.send.calledOnce).to.be.true
    })
  })

  describe('getTokenBalances', () => {
    it('should return token balances of an address', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.mainnet
      const fakeResponse = {
        tokenBalances: [
          { contractAddress: '0xTokenAddress1', tokenBalance: '0x10' }, // 16
          { contractAddress: '0xTokenAddress2', tokenBalance: '0x1a' }, // 26
        ],
      }
      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => providerStub } as any)

      const balances = await Web3Helper.getTokenBalances(fakeAddress, fakeNetwork)
      expect(balances.length).to.equal(2)
      expect(balances[0].tokenBalance).to.equal('16')
      expect(balances[1].tokenBalance).to.equal('26')
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('alchemy_getTokenBalances', [fakeAddress])).to.be.true
    })

    it('should return an empty array on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.mainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => providerStub } as any)

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
    expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
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
      expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
    })
  })

  describe('getAddressFromEns', () => {
    it('should get address from ens', async () => {
      const resolveName = sandbox.stub().resolves('0x000001')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        resolveName,
      })

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq('0x000001')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(resolveName.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error resolving ENS name' as any)).to.be.true
    })
  })

  describe('getEnsFromAddress', () => {
    it('should get address from ens', async () => {
      const lookupAddress = sandbox.stub().resolves('aavegotchi.dao.eth')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        lookupAddress,
      })

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq('aavegotchi.dao.eth')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(lookupAddress.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error looking up address' as any)).to.be.true
    })
  })

  describe('ensExists', () => {
    it('should check if ensExists', async () => {
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
      const result = await MockedWeb3Helper.ensExists(ensName, NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(stubRecordExistsStub.calledOnce).to.be.true
    })

    it('should log an error if checking ENS existence fails', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const error = new Error('Contract call failed')
      const stubRecordExistsStub = sandbox.stub().rejects(error) // Simulate error
      const stubLoggerError = sandbox.stub(Logger, 'error') // Stub logger's error to verify it's called

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
      const result = await MockedWeb3Helper.ensExists(ensName, NetworksEnum.mainnet)

      expect(result).to.be.false
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('Error ensExists' as any)).to.be.true
    })
  })

  describe('getTransaction', () => {
    it('should getTransaction successfully', async () => {
      const txHash = '0x0'
      const getTransactionStub = sandbox.stub().resolves(true)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransaction: getTransactionStub,
      })

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.mainnet)

      expect(result).to.be.true
    })

    it('should fails getTransaction', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransaction: getTransactionStub,
      })

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.mainnet)

      expect(result).to.be.null
      expect(getTransactionStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction' as any)).to.be.true
    })
  })

  describe('getTransactionReceipt', () => {
    it('should getTransactionReceipt successfully', async () => {
      const txHash = '0x0'
      const getTransactionReceiptStubStub = sandbox.stub().resolves(true)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransactionReceipt: getTransactionReceiptStubStub,
      })

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(getTransactionReceiptStubStub.calledOnceWith(txHash)).to.be.true
    })

    it('should fails getTransactionReceipt', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionReceiptStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransactionReceipt: getTransactionReceiptStub,
      })

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.mainnet)

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

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.mainnet)

      expect(result).to.deep.equal({
        address: '0xTokenAddress',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 18,
        totalSupply: 200,
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
      const stubLogger = sandbox.stub(Logger, 'error')

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

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.mainnet)

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

  describe('getDataFromTxReceipt', () => {
    it('should getDataFromTxReceipt', async () => {
      const stubTransactionReceipt = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const stubFindLogsByName = sandbox.stub(Web3Helper, 'findLogsByName').returns([1] as any)

      const params = {
        txLog: { transactionHash: '0x0' },
        eventName: 'test',
        abi: '',
        network: NetworksEnum.mainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params)

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
        network: NetworksEnum.mainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params)

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
        network: NetworksEnum.mainnet,
      }
      const result: any = await Web3Helper.getDataFromTxReceipt(params)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Failed to find event' as any)).to.be.true
      expect(result).to.be.undefined
      expect(stubTransactionReceipt.calledOnceWith(params.txLog.transactionHash, params.network)).to.be.true
      expect(stubFindLogsByName.calledOnceWith(true as any, params.eventName, params.abi)).to.be.true
    })
  })
})
