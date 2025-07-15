import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import {
  ITokenType,
  NetworksEnum,
  ITokenSyncTagName,
  IndexerType,
  IEnumIndexerService,
  LogServicePattern,
} from '@types'
import logger from '@logger'
import ConfigIndexerHelper from '@helpers/configIndexer'

describe('Helpers: ConfigIndexerHelper', () => {
  let sandbox: SinonSandbox
  let loggerErrorStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerErrorStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('builders', () => {
    describe('deposit', () => {
      it('should create deposit logService', () => {
        const address = '0x123456789'
        const result = ConfigIndexerHelper.builders.deposit(address)
        expect(result).to.equal(`deposit-${address}-depositTxs`)
      })
    })

    describe('withdraw', () => {
      it('should create withdraw logService', () => {
        const address = '0xabcdef123'
        const result = ConfigIndexerHelper.builders.withdraw(address)
        expect(result).to.equal(`withdraw-${address}-withdrawTxs`)
      })
    })

    describe('indexer', () => {
      it('should create indexer logService', () => {
        const network = NetworksEnum.ethereumMainnet
        const result = ConfigIndexerHelper.builders.indexer(network)
        expect(result).to.equal(`indexer-${network}`)
      })
    })

    describe('plugin', () => {
      it('should create plugin logService', () => {
        const interfaceType = 'voting' as any
        const network = NetworksEnum.polygonMainnet
        const address = '0xplugin123'
        const result = ConfigIndexerHelper.builders.plugin(interfaceType, network, address)
        expect(result).to.equal(`${interfaceType}-${network}-${address}`)
      })
    })

    describe('dao', () => {
      it('should create dao logService', () => {
        const network = NetworksEnum.baseMainnet
        const address = '0xdao123'
        const result = ConfigIndexerHelper.builders.dao(network, address)
        expect(result).to.equal(`dao-${network}-${address}`)
      })
    })

    describe('token', () => {
      it('should create basic token logService without sync tag', () => {
        const tokenType = ITokenType.ERC20
        const network = NetworksEnum.arbitrumMainnet
        const address = '0xtoken123'
        const result = ConfigIndexerHelper.builders.token(tokenType, network, address)
        expect(result).to.equal(`${tokenType}-${network}-${address}`)
      })

      it('should create token logService with sync tag', () => {
        const tokenType = ITokenType.ERC721
        const network = NetworksEnum.optimismMainnet
        const address = '0xnft123'
        const syncTag = ITokenSyncTagName.delegates
        const result = ConfigIndexerHelper.builders.token(tokenType, network, address, syncTag)
        expect(result).to.equal(`${tokenType}-${network}-${address}-${syncTag}`)
      })

      it('should throw error for native token type', () => {
        expect(() => {
          ConfigIndexerHelper.builders.token(ITokenType.native, NetworksEnum.ethereumMainnet, '0xtoken123')
        }).to.throw("Invalid token type for logService: native. Cannot use 'native' or 'unknown'.")
      })

      it('should throw error for unknown token type', () => {
        expect(() => {
          ConfigIndexerHelper.builders.token(ITokenType.unknown, NetworksEnum.ethereumMainnet, '0xtoken123')
        }).to.throw("Invalid token type for logService: unknown. Cannot use 'native' or 'unknown'.")
      })

      it('should create token logService with all valid token types', () => {
        const validTypes = [
          ITokenType.ERC20,
          ITokenType.ERC721,
          ITokenType.ERC1155,
          ITokenType.ERC777,
          ITokenType.escrowAdapter,
        ]
        const network = NetworksEnum.ethereumMainnet
        const address = '0xtoken123'

        validTypes.forEach(tokenType => {
          const result = ConfigIndexerHelper.builders.token(tokenType, network, address)
          expect(result).to.equal(`${tokenType}-${network}-${address}`)
        })
      })

      it('should create token logService with all sync tag types', () => {
        const tokenType = ITokenType.ERC20
        const network = NetworksEnum.ethereumMainnet
        const address = '0xtoken123'
        const syncTags = [ITokenSyncTagName.delegates, ITokenSyncTagName.transfers, ITokenSyncTagName.holders]

        syncTags.forEach(syncTag => {
          const result = ConfigIndexerHelper.builders.token(tokenType, network, address, syncTag)
          expect(result).to.equal(`${tokenType}-${network}-${address}-${syncTag}`)
        })
      })
    })
  })

  describe('guards', () => {
    describe('isDeposit', () => {
      it('should return true for deposit service', () => {
        const service = 'deposit-0x123-depositTxs'
        expect(ConfigIndexerHelper.guards.isDeposit(service)).to.be.true
      })

      it('should return false for non-deposit service', () => {
        expect(ConfigIndexerHelper.guards.isDeposit('withdraw-0x123-withdrawTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isDeposit('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isDeposit(null)).to.be.false
      })
    })

    describe('isWithdraw', () => {
      it('should return true for withdraw service', () => {
        const service = 'withdraw-0x123-withdrawTxs'
        expect(ConfigIndexerHelper.guards.isWithdraw(service)).to.be.true
      })

      it('should return false for non-withdraw service', () => {
        expect(ConfigIndexerHelper.guards.isWithdraw('deposit-0x123-depositTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isWithdraw(null)).to.be.false
      })
    })

    describe('isIndexer', () => {
      it('should return true for indexer service', () => {
        const service = 'indexer-ethereum-mainnet'
        expect(ConfigIndexerHelper.guards.isIndexer(service)).to.be.true
      })

      it('should return false for non-indexer service', () => {
        expect(ConfigIndexerHelper.guards.isIndexer('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isIndexer(null)).to.be.false
      })
    })

    describe('isDao', () => {
      it('should return true for dao service', () => {
        const service = 'dao-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isDao(service)).to.be.true
      })

      it('should return false for non-dao service', () => {
        expect(ConfigIndexerHelper.guards.isDao('deposit-0x123-depositTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isDao(null)).to.be.false
      })
    })

    describe('isToken', () => {
      it('should return true for token services', () => {
        expect(ConfigIndexerHelper.guards.isToken('ERC20-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.guards.isToken('ERC721-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.guards.isToken('ERC1155-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.guards.isToken('ERC777-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.guards.isToken('escrowAdapter-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.guards.isToken('ERC20-ethereum-mainnet-0x123-delegates')).to.be.true
      })

      it('should return false for non-token services', () => {
        // Use type assertion for invalid token types that TypeScript correctly rejects
        expect(ConfigIndexerHelper.guards.isToken('native-ethereum-mainnet-0x123' as any)).to.be.false
        expect(ConfigIndexerHelper.guards.isToken('unknown-ethereum-mainnet-0x123' as any)).to.be.false
        expect(ConfigIndexerHelper.guards.isToken('deposit-0x123-depositTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isToken(null)).to.be.false
      })
    })

    describe('isPlugin', () => {
      it('should return true for plugin service', () => {
        const service = 'voting-ethereum-mainnet-0x123' as LogServicePattern
        expect(ConfigIndexerHelper.guards.isPlugin(service)).to.be.true
      })

      it('should return false for known service types', () => {
        expect(ConfigIndexerHelper.guards.isPlugin('deposit-0x123-depositTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('withdraw-0x123-withdrawTxs')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('ERC20-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin(null)).to.be.false
      })
    })
  })

  describe('parser', () => {
    describe('parse', () => {
      it('should parse null service', () => {
        const result = ConfigIndexerHelper.parser.parse(null)
        expect(result).to.be.null
        expect(loggerErrorStub.calledOnce).to.be.true
      })

      it('should parse deposit service', () => {
        const result = ConfigIndexerHelper.parser.parse('deposit-0x123-depositTxs')
        expect(result).to.deep.equal({
          type: IndexerType.deposit,
          address: '0x123',
          service: IEnumIndexerService.depositTxs,
        })
      })

      it('should parse withdraw service', () => {
        const result = ConfigIndexerHelper.parser.parse('withdraw-0x456-withdrawTxs')
        expect(result).to.deep.equal({
          type: IndexerType.withdraw,
          address: '0x456',
          service: IEnumIndexerService.withdrawTxs,
        })
      })

      it('should parse indexer service', () => {
        const result = ConfigIndexerHelper.parser.parse('indexer-ethereum-mainnet')
        expect(result).to.deep.equal({
          type: IndexerType.indexer,
          network: 'ethereum-mainnet',
        })
      })

      it('should parse dao service', () => {
        const result = ConfigIndexerHelper.parser.parse('dao-polygon-mainnet-0x789')
        expect(result).to.deep.equal({
          type: IndexerType.dao,
          network: 'polygon-mainnet',
          address: '0x789',
        })
      })

      it('should parse token service without sync tag', () => {
        const result = ConfigIndexerHelper.parser.parse('ERC20-base-mainnet-0xabc')
        expect(result).to.deep.equal({
          type: IndexerType.token,
          tokenType: ITokenType.ERC20,
          network: 'base-mainnet',
          address: '0xabc',
        })
      })

      it('should parse token service with sync tag', () => {
        const result = ConfigIndexerHelper.parser.parse('ERC721-arbitrum-mainnet-0xdef-delegates')
        expect(result).to.deep.equal({
          type: IndexerType.token,
          tokenType: ITokenType.ERC721,
          network: 'arbitrum-mainnet',
          address: '0xdef',
          syncTag: ITokenSyncTagName.delegates,
        })
      })

      it('should parse token service with invalid sync tag as regular token', () => {
        const result = ConfigIndexerHelper.parser.parse('ERC20-ethereum-mainnet-0x123-invalid')
        expect(result).to.deep.equal({
          type: IndexerType.token,
          tokenType: ITokenType.ERC20,
          network: 'ethereum-mainnet',
          address: '0x123',
          // No syncTag because 'invalid' is not a valid sync tag
        })
      })

      it('should parse plugin service', () => {
        const result = ConfigIndexerHelper.parser.parse('voting-optimism-mainnet-0x999' as LogServicePattern)
        expect(result).to.deep.equal({
          type: IndexerType.plugin,
          interfaceType: 'voting',
          network: 'optimism-mainnet',
          address: '0x999',
        })
      })
    })

    describe('getType', () => {
      it('should return correct type for each service', () => {
        expect(ConfigIndexerHelper.parser.getType(null)).to.be.null
        expect(ConfigIndexerHelper.parser.getType('deposit-0x123-depositTxs')).to.equal(IndexerType.deposit)
        expect(ConfigIndexerHelper.parser.getType('withdraw-0x123-withdrawTxs')).to.equal(IndexerType.withdraw)
        expect(ConfigIndexerHelper.parser.getType('indexer-ethereum-mainnet')).to.equal(IndexerType.indexer)
        expect(ConfigIndexerHelper.parser.getType('dao-ethereum-mainnet-0x123')).to.equal(IndexerType.dao)
        expect(ConfigIndexerHelper.parser.getType('ERC20-ethereum-mainnet-0x123')).to.equal(IndexerType.token)
        expect(ConfigIndexerHelper.parser.getType('voting-ethereum-mainnet-0x123' as LogServicePattern)).to.equal(
          IndexerType.plugin,
        )
      })

      it('should return null for invalid service', () => {
        expect(ConfigIndexerHelper.parser.getType('invalid-service' as any)).to.be.null
      })
    })

    describe('hasSyncTag', () => {
      it('should return true for token service with sync tag', () => {
        expect(ConfigIndexerHelper.parser.hasSyncTag('ERC20-ethereum-mainnet-0x123-delegates')).to.be.true
        expect(ConfigIndexerHelper.parser.hasSyncTag('ERC721-polygon-mainnet-0x456-transfers')).to.be.true
        expect(ConfigIndexerHelper.parser.hasSyncTag('ERC1155-base-mainnet-0x789-holders')).to.be.true
      })

      it('should return false for token service without sync tag', () => {
        expect(ConfigIndexerHelper.parser.hasSyncTag('ERC20-ethereum-mainnet-0x123')).to.be.false
      })

      it('should return false for token service with invalid sync tag', () => {
        expect(ConfigIndexerHelper.parser.hasSyncTag('ERC20-ethereum-mainnet-0x123-invalid')).to.be.false
      })

      it('should return false for non-token services', () => {
        expect(ConfigIndexerHelper.parser.hasSyncTag('deposit-0x123-depositTxs')).to.be.false
        expect(ConfigIndexerHelper.parser.hasSyncTag('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.parser.hasSyncTag(null)).to.be.false
      })
    })

    describe('getSyncTag', () => {
      it('should return sync tag for token service with valid sync tag', () => {
        expect(ConfigIndexerHelper.parser.getSyncTag('ERC20-ethereum-mainnet-0x123-delegates')).to.equal(
          ITokenSyncTagName.delegates,
        )
        expect(ConfigIndexerHelper.parser.getSyncTag('ERC721-polygon-mainnet-0x456-transfers')).to.equal(
          ITokenSyncTagName.transfers,
        )
        expect(ConfigIndexerHelper.parser.getSyncTag('ERC1155-base-mainnet-0x789-holders')).to.equal(
          ITokenSyncTagName.holders,
        )
      })

      it('should return null for token service without sync tag', () => {
        expect(ConfigIndexerHelper.parser.getSyncTag('ERC20-ethereum-mainnet-0x123')).to.be.null
      })

      it('should return null for token service with invalid sync tag', () => {
        expect(ConfigIndexerHelper.parser.getSyncTag('ERC20-ethereum-mainnet-0x123-invalid')).to.be.null
      })

      it('should return null for non-token services', () => {
        expect(ConfigIndexerHelper.parser.getSyncTag('deposit-0x123-depositTxs')).to.be.null
        expect(ConfigIndexerHelper.parser.getSyncTag('dao-ethereum-mainnet-0x123')).to.be.null
        expect(ConfigIndexerHelper.parser.getSyncTag(null)).to.be.null
      })
    })
  })

  describe('validators', () => {
    describe('isValidLogService', () => {
      it('should return true for valid services', () => {
        expect(ConfigIndexerHelper.validators.isValidLogService('deposit-0x123-depositTxs')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('withdraw-0x123-withdrawTxs')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('indexer-ethereum-mainnet')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('dao-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('ERC20-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('voting-ethereum-mainnet-0x123' as LogServicePattern))
          .to.be.true
      })

      it('should return false for invalid services', () => {
        expect(ConfigIndexerHelper.validators.isValidLogService(null)).to.be.false
        expect(ConfigIndexerHelper.validators.isValidLogService('' as any)).to.be.false
        expect(ConfigIndexerHelper.validators.isValidLogService(undefined as any)).to.be.false
        expect(ConfigIndexerHelper.validators.isValidLogService('invalid-service' as any)).to.be.false
      })
    })

    describe('validateAndParse', () => {
      it('should parse valid service', () => {
        const result = ConfigIndexerHelper.validators.validateAndParse('deposit-0x123-depositTxs')
        expect(result).to.deep.equal({
          type: IndexerType.deposit,
          address: '0x123',
          service: IEnumIndexerService.depositTxs,
        })
      })

      it('should return null and log error for invalid service', () => {
        const result = ConfigIndexerHelper.validators.validateAndParse(null)
        expect(result).to.be.null
        expect(loggerErrorStub.calledWith('Invalid logService format')).to.be.true
      })
    })
  })

  describe('utils', () => {
    describe('getValidTokenTypes', () => {
      it('should return all token types except native and unknown', () => {
        const result = ConfigIndexerHelper.utils.getValidTokenTypes()
        expect(result).to.include(ITokenType.ERC20)
        expect(result).to.include(ITokenType.ERC721)
        expect(result).to.include(ITokenType.ERC1155)
        expect(result).to.include(ITokenType.ERC777)
        expect(result).to.include(ITokenType.escrowAdapter)
        expect(result).to.not.include(ITokenType.native)
        expect(result).to.not.include(ITokenType.unknown)
      })
    })

    describe('isValidTokenTypeForLogService', () => {
      it('should return true for valid token types', () => {
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.ERC20)).to.be.true
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.ERC721)).to.be.true
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.ERC1155)).to.be.true
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.ERC777)).to.be.true
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.escrowAdapter)).to.be.true
      })

      it('should return false for invalid token types', () => {
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.native)).to.be.false
        expect(ConfigIndexerHelper.utils.isValidTokenTypeForLogService(ITokenType.unknown)).to.be.false
      })
    })

    describe('getValidSyncTags', () => {
      it('should return all sync tag values', () => {
        const result = ConfigIndexerHelper.utils.getValidSyncTags()
        expect(result).to.deep.equal([
          ITokenSyncTagName.delegates,
          ITokenSyncTagName.transfers,
          ITokenSyncTagName.holders,
        ])
      })
    })

    describe('isValidSyncTag', () => {
      it('should return true for valid sync tags', () => {
        expect(ConfigIndexerHelper.utils.isValidSyncTag('delegates')).to.be.true
        expect(ConfigIndexerHelper.utils.isValidSyncTag('transfers')).to.be.true
        expect(ConfigIndexerHelper.utils.isValidSyncTag('holders')).to.be.true
      })

      it('should return false for invalid sync tags', () => {
        expect(ConfigIndexerHelper.utils.isValidSyncTag('invalid')).to.be.false
        expect(ConfigIndexerHelper.utils.isValidSyncTag('')).to.be.false
        expect(ConfigIndexerHelper.utils.isValidSyncTag('delegate')).to.be.false // typo
      })
    })

    describe('addSyncTagToTokenService', () => {
      it('should add sync tag to token service without one', () => {
        const service = 'ERC20-ethereum-mainnet-0x123' as any
        const result = ConfigIndexerHelper.utils.addSyncTagToTokenService(service, ITokenSyncTagName.delegates)
        expect(result).to.equal('ERC20-ethereum-mainnet-0x123-delegates')
      })

      it('should replace existing sync tag', () => {
        const service = 'ERC20-ethereum-mainnet-0x123-transfers' as any
        const result = ConfigIndexerHelper.utils.addSyncTagToTokenService(service, ITokenSyncTagName.holders)
        expect(result).to.equal('ERC20-ethereum-mainnet-0x123-holders')
      })

      it('should throw error for non-token service', () => {
        expect(() => {
          ConfigIndexerHelper.utils.addSyncTagToTokenService(
            'deposit-0x123-depositTxs' as any,
            ITokenSyncTagName.delegates,
          )
        }).to.throw('Service must be a token service')
      })
    })

    describe('removeSyncTagFromTokenService', () => {
      it('should remove sync tag from token service', () => {
        const service = 'ERC20-ethereum-mainnet-0x123-delegates' as any
        const result = ConfigIndexerHelper.utils.removeSyncTagFromTokenService(service)
        expect(result).to.equal('ERC20-ethereum-mainnet-0x123')
      })

      it('should return unchanged service if no sync tag', () => {
        const service = 'ERC20-ethereum-mainnet-0x123' as any
        const result = ConfigIndexerHelper.utils.removeSyncTagFromTokenService(service)
        expect(result).to.equal('ERC20-ethereum-mainnet-0x123')
      })

      it('should throw error for non-token service', () => {
        expect(() => {
          ConfigIndexerHelper.utils.removeSyncTagFromTokenService('dao-ethereum-mainnet-0x123' as any)
        }).to.throw('Service must be a token service')
      })
    })
  })

  describe('Integration tests', () => {
    it('should handle full lifecycle of token service with sync tags', () => {
      // Create basic token service
      const basic = ConfigIndexerHelper.builders.token(ITokenType.ERC20, NetworksEnum.ethereumMainnet, '0xtoken123')
      expect(basic).to.equal('ERC20-ethereum-mainnet-0xtoken123')
      expect(ConfigIndexerHelper.parser.hasSyncTag(basic)).to.be.false

      // Add sync tag
      const withTag = ConfigIndexerHelper.utils.addSyncTagToTokenService(basic, ITokenSyncTagName.delegates)
      expect(withTag).to.equal('ERC20-ethereum-mainnet-0xtoken123-delegates')
      expect(ConfigIndexerHelper.parser.hasSyncTag(withTag)).to.be.true
      expect(ConfigIndexerHelper.parser.getSyncTag(withTag)).to.equal(ITokenSyncTagName.delegates)

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(withTag)
      expect(parsed).to.deep.equal({
        type: IndexerType.token,
        tokenType: ITokenType.ERC20,
        network: NetworksEnum.ethereumMainnet,
        address: '0xtoken123',
        syncTag: ITokenSyncTagName.delegates,
      })

      // Remove sync tag
      const removed = ConfigIndexerHelper.utils.removeSyncTagFromTokenService(withTag)
      expect(removed).to.equal(basic)
    })

    it('should correctly identify all service types', () => {
      const services = [
        { service: 'deposit-0x123-depositTxs', type: IndexerType.deposit },
        { service: 'withdraw-0x456-withdrawTxs', type: IndexerType.withdraw },
        { service: 'indexer-ethereum-mainnet', type: IndexerType.indexer },
        { service: 'dao-polygon-mainnet-0x789', type: IndexerType.dao },
        { service: 'ERC20-base-mainnet-0xabc', type: IndexerType.token },
        { service: 'voting-arbitrum-mainnet-0xdef', type: IndexerType.plugin },
      ]

      services.forEach(({ service, type }) => {
        expect(ConfigIndexerHelper.parser.getType(service as any)).to.equal(type)
        expect(ConfigIndexerHelper.validators.isValidLogService(service as any)).to.be.true
      })
    })
  })
})
