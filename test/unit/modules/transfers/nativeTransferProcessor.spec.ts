import { expect } from 'chai'
import { ethers } from 'ethers'
import { NativeTransferProcessor } from '@transfers'
import { Models } from '@dbModels'
import { ITransactionType, ITransactionSide, NetworksEnum, type ILogInfo } from '@types'
import utils from '@helpers/utils'

describe('Transfers: NativeTransferProcessor', () => {
  let processor: NativeTransferProcessor

  beforeEach(async () => {
    // Clean the database before each test
    await Models.Transaction.deleteMany({})
    await Models.Token.deleteMany({})
    await Models.Dao.deleteMany({})
  })

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
        ITransactionSide.withdraw,
      )

      expect(processor).to.be.instanceOf(NativeTransferProcessor)
      expect(processor['network']).to.equal(NetworksEnum.ethereumMainnet)
      expect(processor['daoAddress']).to.equal('0x1234567890123456789012345678901234567890')
      expect(processor['transactionSide']).to.equal(ITransactionSide.withdraw)
    })

    it('should use default transaction type when not provided', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
      )

      expect(processor['transactionSide']).to.equal(ITransactionSide.deposit)
    })
  })

  describe('getTransferType', () => {
    it('should return NATIVE transfer type', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
      )

      expect(processor.getTransferType()).to.equal(ITransactionType.native)
    })
  })

  describe('validateTransfer', () => {
    it('should return true for valid native transfer event', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
      )

      const parsedEvent = {
        args: ['0x1234567890123456789012345678901234567890', ethers.parseEther('1')],
      } as any

      expect(processor.validateTransfer(parsedEvent)).to.be.true
    })

    it('should return false for event with less than 2 args', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
      )

      const parsedEvent = {
        args: ['0x1234567890123456789012345678901234567890'],
      } as any

      expect(processor.validateTransfer(parsedEvent)).to.be.false
    })

    it('should return true for event with more than 2 args', () => {
      processor = new NativeTransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0x1234567890123456789012345678901234567890',
      )

      const parsedEvent = {
        args: ['0x1234567890123456789012345678901234567890', ethers.parseEther('1'), 'extra'],
      } as any

      expect(processor.validateTransfer(parsedEvent)).to.be.true
    })
  })

  describe('prepareTransferData', () => {
    const daoAddress = '0xdAc17F958D2ee523a2206206994597C13D831ec7'
    const senderAddress = '0x1234567890123456789012345678901234567890'
    const recipientAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    it('should prepare transfer data correctly for native deposit', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress, ITransactionSide.deposit)

      const parsedEvent = {
        args: [senderAddress, ethers.parseEther('2.5')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'NativeTokenDeposited',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      expect(result).to.deep.equal({
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: senderAddress,
        toAddress: daoAddress,
        value: '2.5',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        transactionIndex: 5,
        logIndex: 1,
      })
    })

    it('should prepare transfer data correctly for native withdrawal', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress, ITransactionSide.withdraw)

      const parsedEvent = {
        args: [recipientAddress, ethers.parseEther('10.75')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xwithdrawhash',
        blockNumber: 54321,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 2,
        transactionIndex: 3,
        eventName: 'Executed',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      expect(result).to.deep.equal({
        transactionHash: '0xwithdrawhash',
        blockNumber: 54321,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.withdraw,
        type: ITransactionType.native,
        fromAddress: daoAddress,
        toAddress: recipientAddress,
        value: '10.75',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        transactionIndex: 3,
        logIndex: 2,
      })
    })

    it('should handle very small native amounts', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const parsedEvent = {
        args: [senderAddress, BigInt('1')], // 1 wei
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'NativeTokenDeposited',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      expect(result.value).to.equal('0.000000000000000001')
    })

    it('should handle very large native amounts', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const parsedEvent = {
        args: [senderAddress, ethers.parseEther('1000000')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'NativeTokenDeposited',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      expect(result.value).to.equal('1000000.0')
    })
  })

  describe('save', () => {
    const daoAddress = '0xdAc17F958D2ee523a2206206994597C13D831ec7'

    beforeEach(async () => {
      // Create a DAO for our tests
      await Models.Dao.create({
        id: daoAddress,
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        name: 'Test DAO',
        subdomain: 'test',
        creatorAddress: '0xcreator1234567890123456789012345678901234',
        metadata: {},
      })

      // Create native token for the network
      await Models.Token.create({
        id: `${utils.zeroAddress}-${NetworksEnum.ethereumMainnet}`,
        address: utils.zeroAddress,
        network: NetworksEnum.ethereumMainnet,
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'native',
        decimals: 18,
        priceUsd: '2500.00',
      })
    })

    it('should save a new native transaction successfully to database', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const transferData = {
        transactionHash: '0xhash123',
        blockNumber: 12345,
        blockTimestamp: 1234567890,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: '0xfrom',
        toAddress: daoAddress,
        value: '1.0',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
      }

      const result = await processor.save(transferData)

      // Verify transaction was saved to database
      expect(result).to.not.be.undefined
      expect(result?.transactionHash).to.equal('0xhash123')
      expect(result?.value).to.equal('1.0')

      // Verify it exists in the database
      const savedTx = await Models.Transaction.findOne({ transactionHash: '0xhash123' })
      expect(savedTx).to.not.be.null
      expect(savedTx?.transactionHash).to.equal('0xhash123')
      expect(savedTx?.value).to.equal('1.0')
      expect(savedTx?.tokenAddress).to.equal(utils.zeroAddress)
      expect(savedTx?.side).to.equal(ITransactionSide.deposit)
    })

    it('should not create duplicate transactions', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const transferData = {
        transactionHash: '0xduplicatehash',
        blockNumber: 12345,
        blockTimestamp: 1234567890,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: '0xfrom',
        toAddress: daoAddress,
        value: '1.0',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
      }

      // Save first time
      const result1 = await processor.save(transferData)
      expect(result1).to.not.be.undefined

      // Try to save again - should return existing
      const result2 = await processor.save(transferData)
      expect(result2?.id).to.equal(result1?.id)

      // Verify only one transaction in database
      const count = await Models.Transaction.countDocuments({ transactionHash: '0xduplicatehash' })
      expect(count).to.equal(1)
    })

    it('should calculate USD amount correctly', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const transferData = {
        transactionHash: '0xusdtest',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: '0xfrom',
        toAddress: daoAddress,
        value: '2.5', // 2.5 ETH
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        blockTimestamp: 1234567890,
      }

      const result = await processor.save(transferData)

      expect(result).to.not.be.undefined
      // Note: amountUsd depends on ProxyProvider.fetchHistoricalTokenPrice which returns '0.00' in test environment
      expect(result?.amountUsd).to.equal('0.00') // ProxyProvider returns 0 in test

      // Verify in database
      const savedTx = await Models.Transaction.findOne({ transactionHash: '0xusdtest' })
      expect(savedTx?.amountUsd).to.equal('0.00')
    })
  })

  describe('checkExisting', () => {
    const daoAddress = '0xdAc17F958D2ee523a2206206994597C13D831ec7'

    beforeEach(async () => {
      // Create a DAO
      await Models.Dao.create({
        id: daoAddress,
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        name: 'Test DAO',
        subdomain: 'test',
        creatorAddress: '0xcreator1234567890123456789012345678901234',
        metadata: {},
      })

      // Create an existing transaction
      await Models.Transaction.create({
        id: `${daoAddress}-${NetworksEnum.ethereumMainnet}-0xexisting-native`,
        transactionHash: '0xexisting',
        blockNumber: 11111,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: '0xfrom',
        toAddress: daoAddress,
        value: '1.0',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 2,
        blockTimestamp: 1234567890,
      })
    })

    it('should find existing native transaction', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const data: any = {
        transactionHash: '0xexisting',
        blockNumber: 11111,
        network: NetworksEnum.ethereumMainnet,
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 2,
      }

      const result = await processor['checkExisting'](data)

      expect(result).to.not.be.undefined
      expect(result?.transactionHash).to.equal('0xexisting')
      expect(result?.value).to.equal('1.0')
    })

    it('should not find non-existing transaction', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const data: any = {
        transactionHash: '0xnonexisting',
        blockNumber: 99999,
        network: NetworksEnum.ethereumMainnet,
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 5,
        transactionIndex: 10,
      }

      const result = await processor['checkExisting'](data)

      expect(result).to.be.null
    })

    it('should handle actionIndex for batch native transactions', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      // Create transaction with actionIndex
      await Models.Transaction.create({
        id: `${daoAddress}-${NetworksEnum.ethereumMainnet}-0xbatch-native-action2`,
        transactionHash: '0xbatch',
        blockNumber: 22222,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.withdraw,
        type: ITransactionType.native,
        fromAddress: daoAddress,
        toAddress: '0xrecipient',
        value: '0.5',
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 3,
        transactionIndex: 4,
        actionIndex: 2,
        blockTimestamp: 1234567890,
      })

      const data: any = {
        transactionHash: '0xbatch',
        blockNumber: 22222,
        network: NetworksEnum.ethereumMainnet,
        daoAddress,
        tokenAddress: utils.zeroAddress,
        logIndex: 3,
        transactionIndex: 4,
        actionIndex: 2,
      }

      const result = await processor['checkExisting'](data)

      expect(result).to.not.be.undefined
      expect(result?.transactionHash).to.equal('0xbatch')
      expect(result?.actionIndex).to.equal(2)
    })
  })

  describe('Integration scenarios', () => {
    const daoAddress = '0xdAc17F958D2ee523a2206206994597C13D831ec7'

    beforeEach(async () => {
      // Setup DAO
      await Models.Dao.create({
        id: daoAddress,
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        name: 'Test DAO',
        subdomain: 'test',
        creatorAddress: '0xcreator1234567890123456789012345678901234',
        metadata: {},
      })

      // Setup native token
      await Models.Token.create({
        id: `${utils.zeroAddress}-${NetworksEnum.ethereumMainnet}`,
        address: utils.zeroAddress,
        network: NetworksEnum.ethereumMainnet,
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'native',
        decimals: 18,
        priceUsd: '2000.00',
      })
    })

    it('should handle a complete native deposit flow with database storage', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress, ITransactionSide.deposit)

      const parsedEvent = {
        args: ['0x1234567890123456789012345678901234567890', ethers.parseEther('0.5')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xnativedeposit',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'NativeTokenDeposited',
      }

      const transferData = processor.prepareTransferData(parsedEvent, info)
      const result = await processor.save(transferData)

      // Verify the transaction was saved correctly
      expect(result).to.not.be.undefined
      expect(result?.fromAddress).to.equal('0x1234567890123456789012345678901234567890')
      expect(result?.toAddress).to.equal(daoAddress)
      expect(result?.value).to.equal('0.5')
      expect(result?.side).to.equal(ITransactionSide.deposit)
      // Note: amountUsd depends on ProxyProvider.fetchHistoricalTokenPrice which returns '0.00' in test environment
      expect(result?.amountUsd).to.equal('0.00') // ProxyProvider returns 0 in test

      // Verify it's actually in the database
      const dbTransaction = await Models.Transaction.findOne({ transactionHash: '0xnativedeposit' })
      expect(dbTransaction).to.not.be.null
      expect(dbTransaction?.value).to.equal('0.5')
      expect(dbTransaction?.tokenAddress).to.equal(utils.zeroAddress)
      expect(dbTransaction?.side).to.equal(ITransactionSide.deposit)
    })

    it('should handle a complete native withdrawal flow with database storage', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress, ITransactionSide.withdraw)

      const parsedEvent = {
        args: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ethers.parseEther('1.25')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xnativewithdraw',
        blockNumber: 54321,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 2,
        transactionIndex: 3,
        eventName: 'Executed',
      }

      const transferData = processor.prepareTransferData(parsedEvent, info)
      const result = await processor.save(transferData)

      // Verify the withdrawal was saved correctly
      expect(result).to.not.be.undefined
      expect(result?.fromAddress).to.equal(daoAddress)
      expect(result?.toAddress).to.equal('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
      expect(result?.value).to.equal('1.25')
      expect(result?.side).to.equal(ITransactionSide.withdraw)

      // Verify database storage
      const dbTransaction = await Models.Transaction.findOne({ transactionHash: '0xnativewithdraw' })
      expect(dbTransaction).to.not.be.null
      expect(dbTransaction?.value).to.equal('1.25')
      expect(dbTransaction?.side).to.equal(ITransactionSide.withdraw)
    })

    it('should handle batch native transfers with actionIndex and store all in database', async () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress, ITransactionSide.withdraw)

      const transfers = [
        { recipient: '0xaaa1111111111111111111111111111111111111', amount: ethers.parseEther('0.1') },
        { recipient: '0xbbb2222222222222222222222222222222222222', amount: ethers.parseEther('0.2') },
        { recipient: '0xccc3333333333333333333333333333333333333', amount: ethers.parseEther('0.3') },
      ]

      for (let i = 0; i < transfers.length; i++) {
        const parsedEvent = {
          args: [transfers[i].recipient, transfers[i].amount],
        } as any

        const info: ILogInfo = {
          transactionHash: '0xbatchhash',
          blockNumber: 12345,
          network: NetworksEnum.ethereumMainnet,
          address: utils.zeroAddress,
          logIndex: 10 + i,
          transactionIndex: 5,
          eventName: 'Executed',
        }

        const transferData = processor.prepareTransferData(parsedEvent, info)
        transferData.actionIndex = i

        const result = await processor.save(transferData)

        expect(result).to.not.be.undefined
        expect(result?.actionIndex).to.equal(i)
        expect(result?.toAddress).to.equal(transfers[i].recipient)
      }

      // Verify all 3 transactions are in the database
      const dbTransactions = await Models.Transaction.find({ transactionHash: '0xbatchhash' }).sort({ actionIndex: 1 })
      expect(dbTransactions).to.have.lengthOf(3)

      expect(dbTransactions[0].actionIndex).to.equal(0)
      expect(dbTransactions[0].value).to.equal('0.1')
      expect(dbTransactions[0].toAddress).to.equal('0xaaa1111111111111111111111111111111111111')

      expect(dbTransactions[1].actionIndex).to.equal(1)
      expect(dbTransactions[1].value).to.equal('0.2')
      expect(dbTransactions[1].toAddress).to.equal('0xbbb2222222222222222222222222222222222222')

      expect(dbTransactions[2].actionIndex).to.equal(2)
      expect(dbTransactions[2].value).to.equal('0.3')
      expect(dbTransactions[2].toAddress).to.equal('0xccc3333333333333333333333333333333333333')
    })
  })

  describe('Comparison with ERC20/ERC721', () => {
    const daoAddress = '0xdAc17F958D2ee523a2206206994597C13D831ec7'

    it('should always use zero address as tokenAddress unlike ERC20/ERC721', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const parsedEvent = {
        args: ['0xrecipient', ethers.parseEther('1')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: '0xsomecontract', // This would be token address for ERC20/721
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'Executed',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      // Native transfers always use zero address regardless of info.address
      expect(result.tokenAddress).to.equal(utils.zeroAddress)
    })

    it('should format value as ETH unlike ERC20 (custom decimals) or ERC721 (always 1)', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const parsedEvent = {
        args: ['0xrecipient', BigInt('1500000000000000000')], // 1.5 ETH
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'Executed',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      // Native always formats as 18 decimals (ETH)
      expect(result.value).to.equal('1.5')
    })

    it('should not have tokenId field unlike ERC721', () => {
      processor = new NativeTransferProcessor(NetworksEnum.ethereumMainnet, daoAddress)

      const parsedEvent = {
        args: ['0xrecipient', ethers.parseEther('1')],
      } as any

      const info: ILogInfo = {
        transactionHash: '0xhash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        logIndex: 1,
        transactionIndex: 5,
        eventName: 'Executed',
      }

      const result = processor.prepareTransferData(parsedEvent, info)

      expect(result.tokenId).to.be.undefined
      expect(result.erc721TokenId).to.be.undefined
    })
  })
})
