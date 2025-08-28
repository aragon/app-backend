import { expect } from 'chai'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { TransferProcessorFactory } from '@src/modules/transfers/transferProcessorFactory'
import { Erc20TransferProcessor } from '@src/modules/transfers/erc20TransferProcessor'
import { Erc721TransferProcessor } from '@src/modules/transfers/erc721TransferProcessor'
import { NativeTransferProcessor } from '@src/modules/transfers/nativeTransferProcessor'
import utils from '@helpers/utils'

describe('Module: TransferProcessorFactory', () => {
  const network = NetworksEnum.ethereumMainnet
  const daoAddress = '0xDAOAddress'

  describe('create', () => {
    it('should create Erc20TransferProcessor for ERC20 type', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress)
      expect(processor).to.be.instanceOf(Erc20TransferProcessor)
      expect(processor.getTransferType()).to.equal(ITransactionType.erc20)
    })

    it('should create Erc20TransferProcessor with custom decimals', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress, { decimals: 6 })
      expect(processor).to.be.instanceOf(Erc20TransferProcessor)
      expect(processor).to.have.property('decimals').equal(6)
    })

    it('should create Erc20TransferProcessor with custom transaction side', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress, {
        transactionSide: ITransactionSide.withdraw,
      })
      expect(processor).to.be.instanceOf(Erc20TransferProcessor)
      expect(processor).to.have.property('transactionSide').equal(ITransactionSide.withdraw)
    })

    it('should create Erc721TransferProcessor for ERC721 type', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc721, network, daoAddress)
      expect(processor).to.be.instanceOf(Erc721TransferProcessor)
      expect(processor.getTransferType()).to.equal(ITransactionType.erc721)
    })

    it('should create Erc721TransferProcessor with custom transaction side', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc721, network, daoAddress, {
        transactionSide: ITransactionSide.withdraw,
      })
      expect(processor).to.be.instanceOf(Erc721TransferProcessor)
      expect(processor).to.have.property('transactionSide').equal(ITransactionSide.withdraw)
    })

    it('should create NativeTransferProcessor for native type', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.native, network, daoAddress)
      expect(processor).to.be.instanceOf(NativeTransferProcessor)
      expect(processor.getTransferType()).to.equal(ITransactionType.native)
    })

    it('should create NativeTransferProcessor with custom transaction side', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.native, network, daoAddress, {
        transactionSide: ITransactionSide.withdraw,
      })
      expect(processor).to.be.instanceOf(NativeTransferProcessor)
      expect(processor).to.have.property('transactionSide').equal(ITransactionSide.withdraw)
    })

    it('should use default decimals (18) for ERC20 when not provided', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress)
      expect(processor).to.have.property('decimals').equal(18)
    })

    it('should use default transaction side (deposit) when not provided', () => {
      const processorErc20 = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress)
      const processorErc721 = TransferProcessorFactory.create(ITransactionType.erc721, network, daoAddress)
      const processorNative = TransferProcessorFactory.create(ITransactionType.native, network, daoAddress)

      expect(processorErc20).to.have.property('transactionSide').equal(ITransactionSide.deposit)
      expect(processorErc721).to.have.property('transactionSide').equal(ITransactionSide.deposit)
      expect(processorNative).to.have.property('transactionSide').equal(ITransactionSide.deposit)
    })

    it('should throw error for unknown transfer type', () => {
      const unknownType = 'unknown' as ITransactionType
      expect(() => TransferProcessorFactory.create(unknownType, network, daoAddress)).to.throw(
        'Unknown transfer type: unknown',
      )
    })

    it('should handle all options together for ERC20', () => {
      const processor = TransferProcessorFactory.create(ITransactionType.erc20, network, daoAddress, {
        decimals: 8,
        transactionSide: ITransactionSide.withdraw,
      })
      expect(processor).to.be.instanceOf(Erc20TransferProcessor)
      expect(processor).to.have.property('decimals').equal(8)
      expect(processor).to.have.property('transactionSide').equal(ITransactionSide.withdraw)
    })
  })

  describe('detectType', () => {
    it('should detect ERC721 transfer when args length is 3 and third arg is truthy', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo', '123'], // tokenId as third argument
        signature: 'Transfer(address,address,uint256)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, '0xTokenAddress')
      expect(type).to.equal(ITransactionType.erc721)
    })

    it('should detect native transfer when tokenAddress is undefined', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo'],
        signature: 'Transfer(address,address)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent)
      expect(type).to.equal(ITransactionType.native)
    })

    it('should detect native transfer when tokenAddress is zero address', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo'],
        signature: 'Transfer(address,address)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, utils.zeroAddress)
      expect(type).to.equal(ITransactionType.native)
    })

    it('should detect ERC20 transfer when tokenAddress is provided and args length is not 3', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo'],
        signature: 'Transfer(address,address)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, '0xTokenAddress')
      expect(type).to.equal(ITransactionType.erc20)
    })

    it('should detect ERC20 transfer when args length is 3 but third arg is falsy', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo', null],
        signature: 'Transfer(address,address,uint256)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, '0xTokenAddress')
      expect(type).to.equal(ITransactionType.erc20)
    })

    it('should detect native transfer when tokenAddress is empty string', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo'],
        signature: 'Transfer(address,address)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, '')
      expect(type).to.equal(ITransactionType.native)
    })

    it('should detect ERC20 for regular token address with 2 args', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo'],
        signature: 'Transfer(address,address)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      const type = TransferProcessorFactory.detectType(parsedEvent, '0x1234567890123456789012345678901234567890')
      expect(type).to.equal(ITransactionType.erc20)
    })

    it('should detect ERC721 regardless of tokenAddress when args meet criteria', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xFrom', '0xTo', '999'],
        signature: 'Transfer(address,address,uint256)',
        topic: '0x123',
        fragment: {} as any,
      } as any
      // Should detect ERC721 even with zero address because args[2] exists
      const type = TransferProcessorFactory.detectType(parsedEvent, utils.zeroAddress)
      expect(type).to.equal(ITransactionType.erc721)
    })
  })
})
