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

  describe('refreshAggregationResults', () => {
    it('should skip when no tokens in results', async () => {
      const findStub = sandbox.stub(Models.Token, 'find')
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const results = [{ settings: { token: null } }, { settings: {} }]

      await TotalSupplyRefresh.refreshAggregationResults(
        results,
        (item: any) => item.settings?.token,
        (item: any, totalSupply) => {
          item.settings.token.totalSupply = totalSupply
        },
      )

      expect(findStub.notCalled).to.be.true
      expect(sendStub.notCalled).to.be.true
    })

    it('should skip refresh when DB tokens are fresh', async () => {
      const findStub = sandbox.stub(Models.Token, 'find').resolves([
        {
          address: '0xToken',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: new Date(),
        },
      ] as any)
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const results = [
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
              totalSupply: '100',
            },
          },
        },
      ]

      await TotalSupplyRefresh.refreshAggregationResults(
        results,
        (item: any) => item.settings?.token,
        (item: any, totalSupply) => {
          item.settings.token.totalSupply = totalSupply
        },
      )

      expect(findStub.calledOnce).to.be.true
      expect(sendStub.notCalled).to.be.true
    })

    it('should refresh stale tokens and deduplicate', async () => {
      const findStub = sandbox.stub(Models.Token, 'find').resolves([
        {
          address: '0xToken',
          network: NetworksEnum.ethereumMainnet,
          hasTotalSupply: true,
          totalSupplyUpdatedAt: null,
        },
      ] as any)
      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
        totalSupply: '999',
        totalSupplyUpdatedAt: new Date(),
      })

      const results = [
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
              totalSupply: '100',
            },
          },
        },
        {
          settings: {
            token: {
              address: '0xToken',
              network: NetworksEnum.ethereumMainnet,
              totalSupply: '100',
            },
          },
        },
      ]

      await TotalSupplyRefresh.refreshAggregationResults(
        results,
        (item: any) => item.settings?.token,
        (item: any, totalSupply) => {
          item.settings.token.totalSupply = totalSupply
        },
      )

      expect(findStub.calledOnce).to.be.true
      expect(sendStub.calledOnce).to.be.true
      expect(results[0].settings.token.totalSupply).to.equal('999')
      expect(results[1].settings.token.totalSupply).to.equal('999')
    })
  })
})
