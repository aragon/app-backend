import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { TotalSupplyRefresh } from '@services/aragon-api/helpers/totalSupplyRefresh'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('TotalSupplyRefresh', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('isTotalSupplyStale', () => {
    it('should return false when hasTotalSupply is false', () => {
      const token = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: false,
        totalSupplyUpdatedAt: null,
      }
      expect(TotalSupplyRefresh.isTotalSupplyStale(token)).to.be.false
    })

    it('should return true when hasTotalSupply is true and totalSupplyUpdatedAt is null', () => {
      const token = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: null,
      }
      expect(TotalSupplyRefresh.isTotalSupplyStale(token)).to.be.true
    })

    it('should return true when totalSupplyUpdatedAt is older than TTL', () => {
      const token = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: new Date(Date.now() - config.SERVICES.ARAGON_API.TOTAL_SUPPLY_TTL - 1000),
      }
      expect(TotalSupplyRefresh.isTotalSupplyStale(token)).to.be.true
    })

    it('should return false when totalSupplyUpdatedAt is within TTL', () => {
      const token = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: new Date(),
      }
      expect(TotalSupplyRefresh.isTotalSupplyStale(token)).to.be.false
    })
  })

  describe('refreshIfStale', () => {
    it('should skip refresh when token is fresh', async () => {
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')
      const token = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: new Date(),
        totalSupply: '100',
      }

      await TotalSupplyRefresh.refreshIfStale(token)

      expect(sendStub.notCalled).to.be.true
      expect(token.totalSupply).to.equal('100')
    })

    it('should refresh when token is stale', async () => {
      const now = new Date()
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
        totalSupply: '200',
        totalSupplyUpdatedAt: now,
      })

      const token: any = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: null,
        totalSupply: '100',
      }

      await TotalSupplyRefresh.refreshIfStale(token)

      expect(sendStub.calledOnce).to.be.true
      expect(sendStub.firstCall.args[0]).to.equal(EnumQueueName.tokenTotalSupply)
      expect(token.totalSupply).to.equal('200')
      expect(token.totalSupplyUpdatedAt).to.equal(now)
    })

    it('should handle failure gracefully', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('timeout'))

      const token: any = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        hasTotalSupply: true,
        totalSupplyUpdatedAt: null,
        totalSupply: '100',
      }

      await TotalSupplyRefresh.refreshIfStale(token)

      expect(token.totalSupply).to.equal('100')
    })
  })

  describe('triggerRefreshForStaleTokens', () => {
    it('should trigger refresh for stale tokens only', () => {
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const tokens = [
        {
          address: '0xStale',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: null,
        },
        {
          address: '0xFresh',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: new Date(),
        },
      ]

      TotalSupplyRefresh.triggerRefreshForStaleTokens(tokens)

      expect(sendStub.calledOnce).to.be.true
      expect(sendStub.firstCall.args[0]).to.equal(EnumQueueName.tokenTotalSupply)
    })

    it('should not trigger refresh when all tokens are fresh', () => {
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const tokens = [
        {
          address: '0xFresh',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: new Date(),
        },
      ]

      TotalSupplyRefresh.triggerRefreshForStaleTokens(tokens)

      expect(sendStub.notCalled).to.be.true
    })
  })

  describe('refreshAggregationResults', () => {
    it('should skip when no tokens in results', () => {
      const findStub = sandbox.stub(Models.Token, 'find')

      const results = [{ settings: { token: null } }, { settings: {} }]

      TotalSupplyRefresh.refreshAggregationResults(results, (item: any) => item.settings?.token)

      expect(findStub.notCalled).to.be.true
    })

    it('should query DB and skip refresh when tokens are fresh', async () => {
      const thenFn = sandbox.stub()
      const findStub = sandbox.stub(Models.Token, 'find').returns({ then: thenFn } as any)
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const results = [
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
            },
          },
        },
      ]

      TotalSupplyRefresh.refreshAggregationResults(results, (item: any) => item.settings?.token)

      expect(findStub.calledOnce).to.be.true

      // Simulate DB returning fresh tokens
      const dbCallback = thenFn.firstCall.args[0]
      dbCallback([
        {
          address: '0xToken',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: new Date(),
        },
      ])

      expect(sendStub.notCalled).to.be.true
    })

    it('should refresh stale tokens and deduplicate', async () => {
      const thenFn = sandbox.stub()
      const findStub = sandbox.stub(Models.Token, 'find').returns({ then: thenFn } as any)
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const results = [
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
            },
          },
        },
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
            },
          },
        },
      ]

      TotalSupplyRefresh.refreshAggregationResults(results, (item: any) => item.settings?.token)

      expect(findStub.calledOnce).to.be.true

      // Simulate DB returning stale tokens
      const dbCallback = thenFn.firstCall.args[0]
      dbCallback([
        {
          address: '0xToken',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: null,
        },
      ])

      expect(sendStub.calledOnce).to.be.true
    })
  })
})
