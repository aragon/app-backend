import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITokenType, NetworksEnum, IndexerType, LogServicePattern } from '@types'
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
    describe('nativeDeposit', () => {
      it('should create nativeDeposit logService', () => {
        const network = NetworksEnum.ethereumSepolia
        const address = '0x123456789'
        const result = ConfigIndexerHelper.builders.nativeDeposit(network, address)
        expect(result).to.equal(`nativeDeposit-${network}-${address}`)
      })
    })

    describe('tokenDeposit', () => {
      it('should create tokenDeposit logService', () => {
        const network = NetworksEnum.ethereumSepolia
        const address = '0xabcdef123'
        const result = ConfigIndexerHelper.builders.tokenDeposit(network, address)
        expect(result).to.equal(`tokenDeposit-${network}-${address}`)
      })
    })

    describe('tokenWithdraw', () => {
      it('should create tokenWithdraw logService', () => {
        const network = NetworksEnum.ethereumSepolia
        const address = '0xtoken456'
        const result = ConfigIndexerHelper.builders.tokenWithdraw(network, address)
        expect(result).to.equal(`tokenWithdraw-${network}-${address}`)
      })
    })

    describe('nativeWithdraw', () => {
      it('should create nativeWithdraw logService', () => {
        const network = NetworksEnum.ethereumSepolia
        const address = '0xdao789'
        const result = ConfigIndexerHelper.builders.nativeWithdraw(network, address)
        expect(result).to.equal(`nativeWithdraw-${network}-${address}`)
      })

      it('should create nativeWithdraw logService with different networks', () => {
        const address = '0xdaoWithdraw'
        const networks = [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet]

        networks.forEach(network => {
          const result = ConfigIndexerHelper.builders.nativeWithdraw(network, address)
          expect(result).to.equal(`nativeWithdraw-${network}-${address}`)
        })
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

    describe('permission', () => {
      it('should create permission logService', () => {
        const network = NetworksEnum.ethereumMainnet
        const address = '0xpermission123'
        const result = ConfigIndexerHelper.builders.permission(network, address)
        expect(result).to.equal(`permission-${network}-${address}`)
      })

      it('should create permission logService with different networks', () => {
        const address = '0xpermission456'
        const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

        networks.forEach(network => {
          const result = ConfigIndexerHelper.builders.permission(network, address)
          expect(result).to.equal(`permission-${network}-${address}`)
        })
      })
    })

    describe('transferList', () => {
      it('should create transferList logService', () => {
        const network = NetworksEnum.ethereumMainnet
        const address = '0xtransfer123'
        const result = ConfigIndexerHelper.builders.transferList(network, address)
        expect(result).to.equal(`transferList-${network}-${address}`)
      })

      it('should create transferList logService with different networks', () => {
        const address = '0xtransfer456'
        const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

        networks.forEach(network => {
          const result = ConfigIndexerHelper.builders.transferList(network, address)
          expect(result).to.equal(`transferList-${network}-${address}`)
        })
      })
    })

    describe('lockManager', () => {
      it('should create lockManager logService', () => {
        const network = NetworksEnum.ethereumMainnet
        const address = '0xlockManager123'
        const result = ConfigIndexerHelper.builders.lockManager(network, address)
        expect(result).to.equal(`lockManager-${network}-${address}`)
      })

      it('should create lockManager logService with different networks', () => {
        const address = '0xlockManager456'
        const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

        networks.forEach(network => {
          const result = ConfigIndexerHelper.builders.lockManager(network, address)
          expect(result).to.equal(`lockManager-${network}-${address}`)
        })
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
    })

    describe('campaignAllocationStrategy', () => {
      it('should create campaignStrategy logService', () => {
        const network = NetworksEnum.ethereumMainnet
        const address = '0xcampaign123'
        const result = ConfigIndexerHelper.builders.campaignAllocationStrategy(network, address)
        expect(result).to.equal(`campaignStrategy-${network}-${address}`)
      })

      it('should work with various networks', () => {
        const address = '0xcampaignStrategy'
        const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

        networks.forEach(network => {
          const result = ConfigIndexerHelper.builders.campaignAllocationStrategy(network, address)
          expect(result).to.equal(`campaignStrategy-${network}-${address}`)
        })
      })
    })
  })

  describe('guards', () => {
    describe('isNativeDeposit', () => {
      it('should return true for nativeDeposit service', () => {
        const service = 'nativeDeposit-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isNativeDeposit(service)).to.be.true
      })

      it('should return false for non-nativeDeposit service', () => {
        expect(ConfigIndexerHelper.guards.isNativeDeposit('tokenDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isNativeDeposit('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isNativeDeposit(null)).to.be.false
      })
    })

    describe('isTokenDeposit', () => {
      it('should return true for tokenDeposit service', () => {
        const service = 'tokenDeposit-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isTokenDeposit(service)).to.be.true
      })

      it('should return false for non-tokenDeposit service', () => {
        expect(ConfigIndexerHelper.guards.isTokenDeposit('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTokenDeposit('tokenWithdraw-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTokenDeposit(null)).to.be.false
      })
    })

    describe('isTokenWithdraw', () => {
      it('should return true for tokenWithdraw service', () => {
        const service = 'tokenWithdraw-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isTokenWithdraw(service)).to.be.true
      })

      it('should return false for non-tokenWithdraw service', () => {
        expect(ConfigIndexerHelper.guards.isTokenWithdraw('tokenDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTokenWithdraw('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTokenWithdraw(null)).to.be.false
      })
    })

    describe('isNativeWithdraw', () => {
      it('should return true for nativeWithdraw service', () => {
        const service = 'nativeWithdraw-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isNativeWithdraw(service)).to.be.true
      })

      it('should return false for non-nativeWithdraw service', () => {
        expect(ConfigIndexerHelper.guards.isNativeWithdraw('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isNativeWithdraw('tokenWithdraw-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isNativeWithdraw('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isNativeWithdraw(null)).to.be.false
      })
    })

    describe('isCampaignStrategy', () => {
      it('should return true for campaignStrategy service', () => {
        const service = 'campaignStrategy-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isCampaignStrategy(service)).to.be.true
      })

      it('should return false for non-campaignStrategy service', () => {
        expect(ConfigIndexerHelper.guards.isCampaignStrategy('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isCampaignStrategy('tokenDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isCampaignStrategy('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isCampaignStrategy('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isCampaignStrategy(null)).to.be.false
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
        expect(ConfigIndexerHelper.guards.isDao('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isDao(null)).to.be.false
      })
    })

    describe('isPermission', () => {
      it('should return true for permission service', () => {
        const service = 'permission-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isPermission(service)).to.be.true
      })

      it('should return false for non-permission service', () => {
        expect(ConfigIndexerHelper.guards.isPermission('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPermission('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPermission('voting-ethereum-mainnet-0x123' as LogServicePattern)).to.be
          .false
        expect(ConfigIndexerHelper.guards.isPermission(null)).to.be.false
      })
    })

    describe('isTransferList', () => {
      it('should return true for transferList service', () => {
        const service = 'transferList-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isTransferList(service)).to.be.true
      })

      it('should return false for non-transferList service', () => {
        expect(ConfigIndexerHelper.guards.isTransferList('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTransferList('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTransferList('permission-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isTransferList(null)).to.be.false
      })
    })

    describe('isLockManager', () => {
      it('should return true for lockManager service', () => {
        const service = 'lockManager-ethereum-mainnet-0x123'
        expect(ConfigIndexerHelper.guards.isLockManager(service)).to.be.true
      })

      it('should return false for non-lockManager service', () => {
        expect(ConfigIndexerHelper.guards.isLockManager('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isLockManager('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isLockManager('permission-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isLockManager('transferList-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isLockManager(null)).to.be.false
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
        expect(ConfigIndexerHelper.guards.isToken('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isToken(null)).to.be.false
      })
    })

    describe('isPlugin', () => {
      it('should return true for plugin service', () => {
        const service = 'voting-ethereum-mainnet-0x123' as LogServicePattern
        expect(ConfigIndexerHelper.guards.isPlugin(service)).to.be.true
      })

      it('should return false for known service types', () => {
        expect(ConfigIndexerHelper.guards.isPlugin('nativeDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('tokenDeposit-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('tokenWithdraw-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('indexer-ethereum-mainnet')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('dao-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('permission-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('transferList-ethereum-mainnet-0x123')).to.be.false
        expect(ConfigIndexerHelper.guards.isPlugin('lockManager-ethereum-mainnet-0x123')).to.be.false
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

      it('should parse nativeDeposit service', () => {
        const result = ConfigIndexerHelper.parser.parse('nativeDeposit-ethereum-mainnet-0x123')
        expect(result).to.deep.equal({
          type: IndexerType.nativeDeposit,
          address: '0x123',
          network: NetworksEnum.ethereumMainnet,
        })
      })

      it('should parse tokenDeposit service', () => {
        const result = ConfigIndexerHelper.parser.parse('tokenDeposit-ethereum-mainnet-0x456')
        expect(result).to.deep.equal({
          type: IndexerType.tokenDeposit,
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
        })
      })

      it('should parse tokenWithdraw service', () => {
        const result = ConfigIndexerHelper.parser.parse('tokenWithdraw-polygon-mainnet-0x789')
        expect(result).to.deep.equal({
          type: IndexerType.tokenWithdraw,
          address: '0x789',
          network: NetworksEnum.polygonMainnet,
        })
      })

      it('should parse nativeWithdraw service', () => {
        const result = ConfigIndexerHelper.parser.parse('nativeWithdraw-ethereum-mainnet-0xabc')
        expect(result).to.deep.equal({
          type: IndexerType.nativeWithdraw,
          address: '0xabc',
          network: NetworksEnum.ethereumMainnet,
        })
      })

      it('should parse campaignStrategy service', () => {
        const result = ConfigIndexerHelper.parser.parse('campaignStrategy-polygon-mainnet-0xcampaign123')
        expect(result).to.deep.equal({
          type: IndexerType.campaignStrategy,
          network: NetworksEnum.polygonMainnet,
          address: '0xcampaign123',
        })
      })

      it('should parse permission service', () => {
        const result = ConfigIndexerHelper.parser.parse('permission-ethereum-mainnet-0xabc123')
        expect(result).to.deep.equal({
          type: IndexerType.permission,
          network: 'ethereum-mainnet',
          address: '0xabc123',
        })
      })

      it('should parse transferList service', () => {
        const result = ConfigIndexerHelper.parser.parse('transferList-ethereum-mainnet-0xabc123')
        expect(result).to.deep.equal({
          type: IndexerType.transferList,
          network: 'ethereum-mainnet',
          address: '0xabc123',
        })
      })

      it('should parse transferList service with complex addresses', () => {
        const result = ConfigIndexerHelper.parser.parse('transferList-polygon-mainnet-0x123-456-789')
        expect(result).to.deep.equal({
          type: IndexerType.transferList,
          network: 'polygon-mainnet',
          address: '0x123-456-789',
        })
      })

      it('should parse lockManager service', () => {
        const result = ConfigIndexerHelper.parser.parse('lockManager-ethereum-mainnet-0xlock123')
        expect(result).to.deep.equal({
          type: IndexerType.lockManager,
          network: 'ethereum-mainnet',
          address: '0xlock123',
        })
      })

      it('should parse lockManager service with complex addresses', () => {
        const result = ConfigIndexerHelper.parser.parse('lockManager-polygon-mainnet-0x123-456-789')
        expect(result).to.deep.equal({
          type: IndexerType.lockManager,
          network: 'polygon-mainnet',
          address: '0x123-456-789',
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
        expect(ConfigIndexerHelper.parser.getType('nativeDeposit-ethereum-mainnet-0x123')).to.equal(
          IndexerType.nativeDeposit,
        )
        expect(ConfigIndexerHelper.parser.getType('nativeWithdraw-ethereum-mainnet-0x123')).to.equal(
          IndexerType.nativeWithdraw,
        )
        expect(ConfigIndexerHelper.parser.getType('tokenDeposit-ethereum-mainnet-0x123')).to.equal(
          IndexerType.tokenDeposit,
        )
        expect(ConfigIndexerHelper.parser.getType('tokenWithdraw-ethereum-mainnet-0x123')).to.equal(
          IndexerType.tokenWithdraw,
        )
        expect(ConfigIndexerHelper.parser.getType('campaignStrategy-ethereum-mainnet-0x123')).to.equal(
          IndexerType.campaignStrategy,
        )
        expect(ConfigIndexerHelper.parser.getType('indexer-ethereum-mainnet')).to.equal(IndexerType.indexer)
        expect(ConfigIndexerHelper.parser.getType('dao-ethereum-mainnet-0x123')).to.equal(IndexerType.dao)
        expect(ConfigIndexerHelper.parser.getType('permission-ethereum-mainnet-0x123')).to.equal(IndexerType.permission)
        expect(ConfigIndexerHelper.parser.getType('ERC20-ethereum-mainnet-0x123')).to.equal(IndexerType.token)
        expect(ConfigIndexerHelper.parser.getType('voting-ethereum-mainnet-0x123' as LogServicePattern)).to.equal(
          IndexerType.plugin,
        )
      })

      it('should return null for invalid service', () => {
        expect(ConfigIndexerHelper.parser.getType('invalid-service' as any)).to.be.null
      })

      it('should return transferList type for transferList service', () => {
        expect(ConfigIndexerHelper.parser.getType('transferList-ethereum-mainnet-0x123')).to.equal(
          IndexerType.transferList,
        )
      })

      it('should return lockManager type for lockManager service', () => {
        expect(ConfigIndexerHelper.parser.getType('lockManager-ethereum-mainnet-0x123')).to.equal(
          IndexerType.lockManager,
        )
      })
    })
  })

  describe('validators', () => {
    describe('isValidLogService', () => {
      it('should return true for valid services', () => {
        expect(ConfigIndexerHelper.validators.isValidLogService('nativeDeposit-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('nativeWithdraw-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('tokenDeposit-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('tokenWithdraw-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('campaignStrategy-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('indexer-ethereum-mainnet')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('dao-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('permission-ethereum-mainnet-0x123')).to.be.true
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

      it('should return true for valid transferList service', () => {
        expect(ConfigIndexerHelper.validators.isValidLogService('transferList-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('transferList-polygon-mainnet-0xabc')).to.be.true
      })

      it('should return true for valid lockManager service', () => {
        expect(ConfigIndexerHelper.validators.isValidLogService('lockManager-ethereum-mainnet-0x123')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('lockManager-polygon-mainnet-0xabc')).to.be.true
        expect(ConfigIndexerHelper.validators.isValidLogService('lockManager-base-mainnet-0xdef456')).to.be.true
      })
    })

    describe('validateAndParse', () => {
      it('should parse valid service', () => {
        const result = ConfigIndexerHelper.validators.validateAndParse('nativeDeposit-ethereum-mainnet-0x123')
        expect(result).to.deep.equal({
          type: IndexerType.nativeDeposit,
          address: '0x123',
          network: NetworksEnum.ethereumMainnet,
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
  })

  describe('Integration tests', () => {
    it('should handle transferList service lifecycle', () => {
      // Create transferList service
      const service = ConfigIndexerHelper.builders.transferList(NetworksEnum.ethereumMainnet, '0xtransfer123')
      expect(service).to.equal('transferList-ethereum-mainnet-0xtransfer123')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isTransferList(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.transferList,
        network: NetworksEnum.ethereumMainnet,
        address: '0xtransfer123',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.transferList)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle lockManager service lifecycle', () => {
      // Create lockManager service
      const service = ConfigIndexerHelper.builders.lockManager(NetworksEnum.ethereumMainnet, '0xlockManager123')
      expect(service).to.equal('lockManager-ethereum-mainnet-0xlockManager123')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isLockManager(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.lockManager,
        network: NetworksEnum.ethereumMainnet,
        address: '0xlockManager123',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.lockManager)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle nativeDeposit service lifecycle', () => {
      // Create nativeDeposit service
      const service = ConfigIndexerHelper.builders.nativeDeposit(NetworksEnum.ethereumMainnet, '0xnative123')
      expect(service).to.equal('nativeDeposit-ethereum-mainnet-0xnative123')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isNativeDeposit(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.nativeDeposit,
        network: NetworksEnum.ethereumMainnet,
        address: '0xnative123',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.nativeDeposit)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle tokenDeposit service lifecycle', () => {
      // Create tokenDeposit service
      const service = ConfigIndexerHelper.builders.tokenDeposit(NetworksEnum.polygonMainnet, '0xtoken123')
      expect(service).to.equal('tokenDeposit-polygon-mainnet-0xtoken123')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isTokenDeposit(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.tokenDeposit,
        network: NetworksEnum.polygonMainnet,
        address: '0xtoken123',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.tokenDeposit)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle tokenWithdraw service lifecycle', () => {
      // Create tokenWithdraw service
      const service = ConfigIndexerHelper.builders.tokenWithdraw(NetworksEnum.baseMainnet, '0xwithdraw456')
      expect(service).to.equal('tokenWithdraw-base-mainnet-0xwithdraw456')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isTokenWithdraw(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.tokenWithdraw,
        network: NetworksEnum.baseMainnet,
        address: '0xwithdraw456',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.tokenWithdraw)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle nativeWithdraw service lifecycle', () => {
      // Create nativeWithdraw service
      const service = ConfigIndexerHelper.builders.nativeWithdraw(NetworksEnum.ethereumMainnet, '0xwithdraw123')
      expect(service).to.equal('nativeWithdraw-ethereum-mainnet-0xwithdraw123')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isNativeWithdraw(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.nativeWithdraw,
        network: NetworksEnum.ethereumMainnet,
        address: '0xwithdraw123',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.nativeWithdraw)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should handle campaignStrategy service lifecycle', () => {
      // Create campaignStrategy service
      const service = ConfigIndexerHelper.builders.campaignAllocationStrategy(
        NetworksEnum.polygonMainnet,
        '0xcampaign456',
      )
      expect(service).to.equal('campaignStrategy-polygon-mainnet-0xcampaign456')

      // Verify guard works
      expect(ConfigIndexerHelper.guards.isCampaignStrategy(service)).to.be.true

      // Parse it
      const parsed = ConfigIndexerHelper.parser.parse(service)
      expect(parsed).to.deep.equal({
        type: IndexerType.campaignStrategy,
        network: NetworksEnum.polygonMainnet,
        address: '0xcampaign456',
      })

      // Verify type
      expect(ConfigIndexerHelper.parser.getType(service)).to.equal(IndexerType.campaignStrategy)

      // Validate it
      expect(ConfigIndexerHelper.validators.isValidLogService(service)).to.be.true
    })

    it('should correctly identify all service types', () => {
      const services = [
        { service: 'nativeDeposit-ethereum-mainnet-0x123', type: IndexerType.nativeDeposit },
        { service: 'nativeWithdraw-ethereum-mainnet-0x456', type: IndexerType.nativeWithdraw },
        { service: 'tokenDeposit-ethereum-mainnet-0x789', type: IndexerType.tokenDeposit },
        { service: 'tokenWithdraw-ethereum-mainnet-0xabc', type: IndexerType.tokenWithdraw },
        { service: 'campaignStrategy-ethereum-mainnet-0xdef', type: IndexerType.campaignStrategy },
        { service: 'indexer-ethereum-mainnet', type: IndexerType.indexer },
        { service: 'dao-polygon-mainnet-0x789', type: IndexerType.dao },
        { service: 'permission-ethereum-mainnet-0xperm123', type: IndexerType.permission },
        { service: 'transferList-ethereum-mainnet-0xtransfer123', type: IndexerType.transferList },
        { service: 'lockManager-ethereum-mainnet-0xlockManager123', type: IndexerType.lockManager },
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
