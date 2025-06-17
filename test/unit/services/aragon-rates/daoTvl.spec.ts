import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchDaoTvl } from '@services/aragon-rates/daoTvl'
import logger from '@logger'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'

describe('AragonRates: FetchDaoTvl', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    FetchDaoTvl.progress = 0
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the FetchDaoTvl process for all networks', async () => {
      const findStub = sandbox.stub(Models.Dao, 'find').returns({
        distinct: sandbox.stub().resolves(['0xdao1', '0xdao2']),
      } as any)

      const fetchAndUpdateTvlStub = sandbox.stub(FetchDaoTvl, 'fetchAndUpdateTvl').resolves()

      const loggerStub = sandbox.stub(logger, 'verbose')

      await FetchDaoTvl.start()

      expect(findStub.callCount).to.be.eq(6)
      expect(findStub.firstCall.args[0].network).to.be.eq(NetworksEnum.ethereumMainnet)
      expect(findStub.secondCall.args[0].network).to.be.eq(NetworksEnum.polygonMainnet)
      expect(findStub.thirdCall.args[0].network).to.be.eq(NetworksEnum.baseMainnet)
      expect(findStub.getCall(3).args[0].network).to.be.eq(NetworksEnum.arbitrumMainnet)
      expect(findStub.getCall(4).args[0].network).to.be.eq(NetworksEnum.zksyncMainnet)
      expect(findStub.getCall(5).args[0].network).to.be.eq(NetworksEnum.optimismMainnet)
      expect(loggerStub.args[0][0]).to.be.eq('Start FetchDaoTvl' as any)
      expect(fetchAndUpdateTvlStub.callCount).to.be.eq(6)
    })
  })

  describe('fetchAndUpdateTvl', () => {
    it('should fetch and process DAO assets in a single batch', async () => {
      const daoAddresses = ['0xdao1', '0xdao2', '0xdao3']
      const network = NetworksEnum.ethereumMainnet

      const nativeBalances = {
        '0xdao1': '100000000000000000',
        '0xdao2': '200000000000000000',
        '0xdao3': '0',
      }
      const getNativeBalancesStub = sandbox.stub(Web3BatchHelper, 'getNativeBalancesInBatch').resolves(nativeBalances)

      const tokenBalances = {
        '0xdao1': [{ tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' }],
        '0xdao2': [{ tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' }],
        '0xdao3': [{ tokenAddress: '0xtoken3', tokenBalance: '0' }],
      }
      const getTokenBalancesStub = sandbox
        .stub(Web3BatchHelper, 'getTokenBalancesInBatch')
        .resolves(tokenBalances as any)

      const chunkArrayStub = sandbox.stub(Utils, 'chunkArray').returns([daoAddresses])

      const handleAssetsStub = sandbox.stub(FetchDaoTvl, 'handleAssetsForEachDao').resolves()

      await FetchDaoTvl.fetchAndUpdateTvl(daoAddresses, network)

      expect(getNativeBalancesStub.calledOnceWith(daoAddresses, network)).to.be.true
      expect(chunkArrayStub.calledOnceWith(daoAddresses, 50)).to.be.true
      expect(getTokenBalancesStub.calledOnceWith(daoAddresses, network)).to.be.true

      expect(handleAssetsStub.callCount).to.equal(3)

      expect(handleAssetsStub.firstCall.args[0]).to.equal('0xdao1')
      expect(handleAssetsStub.firstCall.args[1]).to.equal(network)
      expect(handleAssetsStub.firstCall.args[2]).to.deep.equal({
        nativeBalance: '100000000000000000',
        tokenBalances: [{ tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' }],
      })

      expect(handleAssetsStub.secondCall.args[0]).to.equal('0xdao2')
      expect(handleAssetsStub.secondCall.args[1]).to.equal(network)
      expect(handleAssetsStub.secondCall.args[2]).to.deep.equal({
        nativeBalance: '200000000000000000',
        tokenBalances: [{ tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' }],
      })

      expect(handleAssetsStub.thirdCall.args[0]).to.equal('0xdao3')
      expect(handleAssetsStub.thirdCall.args[1]).to.equal(network)
      expect(handleAssetsStub.thirdCall.args[2]).to.deep.equal({
        nativeBalance: '0',
        tokenBalances: [{ tokenAddress: '0xtoken3', tokenBalance: '0' }],
      })
    })

    it('should handle multiple batches of token balances', async () => {
      const daoAddresses = ['0xdao1', '0xdao2', '0xdao3', '0xdao4']
      const network = NetworksEnum.ethereumMainnet

      const nativeBalances = {
        '0xdao1': '100000000000000000',
        '0xdao2': '200000000000000000',
        '0xdao3': '300000000000000000',
        '0xdao4': '400000000000000000',
      }
      sandbox.stub(Web3BatchHelper, 'getNativeBalancesInBatch').resolves(nativeBalances)
      const batch1 = {
        '0xdao1': [{ tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' }],
        '0xdao2': [{ tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' }],
      }

      const batch2 = {
        '0xdao3': [{ tokenAddress: '0xtoken3', tokenBalance: '3000000000000000000' }],
        '0xdao4': [{ tokenAddress: '0xtoken4', tokenBalance: '4000000000000000000' }],
      }

      const getTokenBalancesStub = sandbox.stub(Web3BatchHelper, 'getTokenBalancesInBatch')
      getTokenBalancesStub.onFirstCall().resolves(batch1 as any)
      getTokenBalancesStub.onSecondCall().resolves(batch2 as any)

      sandbox.stub(Utils, 'chunkArray').returns([
        ['0xdao1', '0xdao2'],
        ['0xdao3', '0xdao4'],
      ])

      const handleAssetsStub = sandbox.stub(FetchDaoTvl, 'handleAssetsForEachDao').resolves()

      await FetchDaoTvl.fetchAndUpdateTvl(daoAddresses, network)

      expect(getTokenBalancesStub.calledTwice).to.be.true
      expect(getTokenBalancesStub.firstCall.args[0]).to.deep.equal(['0xdao1', '0xdao2'])
      expect(getTokenBalancesStub.secondCall.args[0]).to.deep.equal(['0xdao3', '0xdao4'])

      expect(handleAssetsStub.callCount).to.equal(4)

      expect(handleAssetsStub.firstCall.args[2].tokenBalances).to.deep.equal([
        { tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' },
      ])
      expect(handleAssetsStub.secondCall.args[2].tokenBalances).to.deep.equal([
        { tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' },
      ])
      expect(handleAssetsStub.thirdCall.args[2].tokenBalances).to.deep.equal([
        { tokenAddress: '0xtoken3', tokenBalance: '3000000000000000000' },
      ])
      expect(handleAssetsStub.getCall(3).args[2].tokenBalances).to.deep.equal([
        { tokenAddress: '0xtoken4', tokenBalance: '4000000000000000000' },
      ])
    })

    it('should handle missing native or token balances', async () => {
      const daoAddresses = ['0xdao1', '0xdao2']
      const network = NetworksEnum.ethereumMainnet

      const nativeBalances = {
        '0xdao1': '100000000000000000',
      }
      sandbox.stub(Web3BatchHelper, 'getNativeBalancesInBatch').resolves(nativeBalances)

      const tokenBalances = {
        '0xdao2': [{ tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' }],
      }
      sandbox.stub(Web3BatchHelper, 'getTokenBalancesInBatch').resolves(tokenBalances as any)

      sandbox.stub(Utils, 'chunkArray').returns([daoAddresses])

      const handleAssetsStub = sandbox.stub(FetchDaoTvl, 'handleAssetsForEachDao').resolves()

      await FetchDaoTvl.fetchAndUpdateTvl(daoAddresses, network)

      expect(handleAssetsStub.callCount).to.equal(2)

      expect(handleAssetsStub.firstCall.args[0]).to.equal('0xdao1')
      expect(handleAssetsStub.firstCall.args[2]).to.deep.equal({
        nativeBalance: '100000000000000000',
        tokenBalances: [],
      })

      expect(handleAssetsStub.secondCall.args[0]).to.equal('0xdao2')
      expect(handleAssetsStub.secondCall.args[2]).to.deep.equal({
        nativeBalance: '0',
        tokenBalances: [{ tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' }],
      })
    })
  })

  describe('handleAssetsForEachDao', () => {
    it('should handle DAO with native balance and token balances', async () => {
      const daoAddress = '0xdao1'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        address: daoAddress,
        network,
        metrics: { tvlUSD: 100 },
      } as any

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      const handleNativeTokenStub = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const removeStaleAssetsStub = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const handleErc20TokenStub = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      const loggerStub = sandbox.stub(logger, 'verbose')

      const assetsData = {
        nativeBalance: '100000000000000000',
        tokenBalances: [
          { tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' },
          { tokenAddress: '0xtoken2', tokenBalance: '0' },
        ],
      }

      await FetchDaoTvl.handleAssetsForEachDao(daoAddress, network, assetsData as any)

      expect(findByAddressStub.calledOnceWith(daoAddress, network)).to.be.true
      expect(handleNativeTokenStub.calledOnceWith(mockDao, '100000000000000000')).to.be.true
      expect(removeStaleAssetsStub.calledOnceWith(mockDao, assetsData.tokenBalances)).to.be.true

      expect(handleErc20TokenStub.callCount).to.equal(1)
      expect(
        handleErc20TokenStub.calledWithMatch(mockDao, {
          tokenAddress: '0xtoken1',
          tokenBalance: '1000000000000000000',
        } as any),
      ).to.be.true

      expect(daoMetricsStub.calledOnceWith({ daoAddress, network })).to.be.true

      expect(FetchDaoTvl.progress).to.equal(1)

      expect(loggerStub.called).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('FetchDaoTvl progress')
    })

    it('should handle DAO with only native balance', async () => {
      const daoAddress = '0xdao1'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        address: daoAddress,
        network,
        metrics: { tvlUSD: 0 },
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      const handleNativeTokenStub = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const removeStaleAssetsStub = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const handleErc20TokenStub = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      sandbox.stub(logger, 'verbose')

      const assetsData = {
        nativeBalance: '100000000000000000',
        tokenBalances: [],
      }

      await FetchDaoTvl.handleAssetsForEachDao(daoAddress, network, assetsData)

      expect(handleNativeTokenStub.calledOnce).to.be.true
      expect(removeStaleAssetsStub.calledOnce).to.be.true
      expect(handleErc20TokenStub.called).to.be.false

      expect(daoMetricsStub.calledOnce).to.be.true

      expect(FetchDaoTvl.progress).to.equal(1)
    })

    it('should handle DAO with only token balances', async () => {
      const daoAddress = '0xdao1'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        address: daoAddress,
        network,
        metrics: { tvlUSD: 0 },
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      const handleNativeTokenStub = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const removeStaleAssetsStub = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const handleErc20TokenStub = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      sandbox.stub(logger, 'verbose')

      const assetsData = {
        nativeBalance: '0',
        tokenBalances: [
          { tokenAddress: '0xtoken1', tokenBalance: '1000000000000000000' },
          { tokenAddress: '0xtoken2', tokenBalance: '2000000000000000000' },
        ],
      } as any

      await FetchDaoTvl.handleAssetsForEachDao(daoAddress, network, assetsData)

      expect(handleNativeTokenStub.called).to.be.false
      expect(removeStaleAssetsStub.calledOnce).to.be.true
      expect(handleErc20TokenStub.calledTwice).to.be.true

      expect(daoMetricsStub.calledOnce).to.be.true

      expect(FetchDaoTvl.progress).to.equal(1)
    })

    it('should skip DaoMetrics when DAO has no assets', async () => {
      const daoAddress = '0xdao1'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        address: daoAddress,
        network,
        metrics: { tvlUSD: 0 },
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      // Mock DaoAssets methods
      const handleNativeTokenStub = sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      const removeStaleAssetsStub = sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      const handleErc20TokenStub = sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      // Mock DaoMetrics
      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      // Mock logger
      sandbox.stub(logger, 'verbose')

      const assetsData = {
        nativeBalance: '0',
        tokenBalances: [
          { tokenAddress: '0xtoken1', tokenBalance: '0' },
          { tokenAddress: '0xtoken2', tokenBalance: '0' },
        ],
      } as any

      await FetchDaoTvl.handleAssetsForEachDao(daoAddress, network, assetsData)

      expect(handleNativeTokenStub.called).to.be.false
      expect(removeStaleAssetsStub.calledOnce).to.be.true
      expect(handleErc20TokenStub.called).to.be.false

      // Verify DaoMetrics.start was NOT called because there are no assets
      expect(daoMetricsStub.called).to.be.false

      // Check that progress was incremented
      expect(FetchDaoTvl.progress).to.equal(1)
    })

    it('should still update DaoMetrics when DAO has existing tvlUSD', async () => {
      const daoAddress = '0xdao1'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        address: daoAddress,
        network,
        metrics: { tvlUSD: 100 }, // Has existing TVL
      }

      // Mock findByAddress
      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)

      // Mock DaoAssets methods
      sandbox.stub(DaoAssets, '_handleNativeToken').resolves()
      sandbox.stub(DaoAssets, '_removeStaleAssets').resolves()
      sandbox.stub(DaoAssets, '_handleErc20Token').resolves()

      // Mock DaoMetrics
      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      // Mock logger
      sandbox.stub(logger, 'verbose')

      const assetsData = {
        nativeBalance: '0',
        tokenBalances: [{ tokenAddress: '0xtoken1', tokenBalance: '0' }],
      } as any

      await FetchDaoTvl.handleAssetsForEachDao(daoAddress, network, assetsData)

      // Verify DaoMetrics.start WAS called because there's existing TVL
      expect(daoMetricsStub.calledOnce).to.be.true

      // Check that progress was incremented
      expect(FetchDaoTvl.progress).to.equal(1)
    })
  })
})
