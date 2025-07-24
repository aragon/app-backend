import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import AragonReQueueService from '@services/aragon-requeue'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { IndexerType, IPluginInterfaceType } from '@types'

describe('AragonRequeue: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should start', async () => {
    const dbData = [
      {
        id: 'ethereum-mainnet-gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        network: 'ethereum-mainnet',
        service: 'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        lastSync: 22082879,
      },
      {
        id: 'polygon-mainnet-tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7',
        network: 'polygon-mainnet',
        service: 'tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7',
        lastSync: 68998403,
      },
      {
        id: 'ethereum-sepolia-tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
        network: 'ethereum-sepolia',
        service: 'tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
        lastSync: 7893826,
      },
      {
        id: 'base-mainnet-tokenVoting-base-mainnet-0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
        network: 'base-mainnet',
        service: 'tokenVoting-base-mainnet-0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
        lastSync: 27556510,
      },
      {
        id: 'zksync-sepolia-tokenVoting-zksync-sepolia-0xb9693D4397E23745dfFB21Ef39095275778e1c09',
        network: 'zksync-sepolia',
        service: 'tokenVoting-zksync-sepolia-0xb9693D4397E23745dfFB21Ef39095275778e1c09',
        lastSync: 4944360,
      },
      {
        id: 'peaq-mainnet-tokenVoting-peaq-mainnet-0x05Bd9dB4B461F9387dA2cF4012666c6Ea5C93Ccb-0x37100474ABdA3788c9A6A8eBB4a910c897A06ebc',
        network: 'peaq-mainnet',
        service:
          'tokenVoting-peaq-mainnet-0x05Bd9dB4B461F9387dA2cF4012666c6Ea5C93Ccb-0x37100474ABdA3788c9A6A8eBB4a910c897A06ebc',
        lastSync: 4883665,
      },
    ]

    await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))

    const dbTokenData = [
      // to check this one
      {
        id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
        network: 'ethereum-sepolia',
        type: 'escrowAdapter',
        address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
      },
      {
        id: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E-ethereum-mainnet',
        network: 'ethereum-mainnet',
        type: 'ERC721',
        address: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
      },
      {
        id: '0xff602165c513E1B73eB644525497521873e923AD-polygon-mainnet',
        network: 'polygon-mainnet',
        type: 'ERC20',
        address: '0xff602165c513E1B73eB644525497521873e923AD',
      },
      {
        id: '0x613ef3f5959688c3b422A545906F844b6f8c8F35-polygon-mainnet',
        network: 'polygon-mainnet',
        type: 'ERC20',
        address: '0x613ef3f5959688c3b422A545906F844b6f8c8F35',
      },

      {
        id: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e-base-mainnet',
        network: 'base-mainnet',
        type: 'ERC20',
        address: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
      },
      {
        id: '0x9f1bbA96d539E467F3822ABd07C4eb5Fc001CE2c-zksync-sepolia',
        network: 'zksync-sepolia',
        type: 'ERC20',
        address: '0x9f1bbA96d539E467F3822ABd07C4eb5Fc001CE2c',
      },
      {
        id: '0x37100474ABdA3788c9A6A8eBB4a910c897A06ebc-peaq-mainnet',
        network: 'peaq-mainnet',
        type: 'ERC20',
        address: '0x37100474ABdA3788c9A6A8eBB4a910c897A06ebc',
      },
    ]

    await Promise.all(dbTokenData.map(async data => Models.Token.create(data)))

    const spyConfigName = sandbox.spy(AragonReQueueService, 'extractInfoFromServiceName')
    const stubRabbitMq = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await AragonReQueueService.start()

    const docs = await Models.ConfigIndexer.find().lean().exec()

    docs.map((doc: any) => {
      expect(doc.id).to.eq(Models.ConfigIndexer.getEntityId({ network: doc.network, service: doc.service }))
    })
    expect(spyConfigName.callCount).to.equal(6) // also grab token config and push as plugin
    expect(stubRabbitMq.callCount).to.equal(6)
  })

  describe('stop method', () => {
    it('should log stop message', async () => {
      const stubLogInfo = sandbox.stub(logger, 'info')

      await AragonReQueueService.stop()

      expect(stubLogInfo.calledWith('ReQueueService stopped' as any)).to.be.true
    })
  })

  describe('extractInfoFromServiceName method', () => {
    describe('valid plugin patterns', () => {
      it('should extract plugin info with single address', () => {
        const service = 'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.plugin,
          interfaceType: 'gauge',
          network: 'ethereum-mainnet',
          pluginAddress: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        })
      })

      it('should extract token info with two addresses', () => {
        const service =
          'tokenVoting-base-mainnet-0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.token,
          interfaceType: 'tokenVoting',
          network: 'base-mainnet',
          pluginAddress: '0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7',
          tokenAddress: '0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
        })
      })

      it('should handle all plugin interface types', () => {
        const pluginTypes = Object.values(IPluginInterfaceType)

        pluginTypes.forEach(pluginType => {
          const service = `${pluginType}-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E`
          const result = AragonReQueueService.extractInfoFromServiceName(service)

          expect(result).to.deep.equal({
            indexerType: IndexerType.plugin,
            interfaceType: pluginType,
            network: 'ethereum-mainnet',
            pluginAddress: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
          })
        })
      })

      it('should handle network names with hyphens', () => {
        const service = 'gauge-arbitrum-one-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.plugin,
          interfaceType: 'gauge',
          network: 'arbitrum-one',
          pluginAddress: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        })
      })

      it('should handle complex network names', () => {
        const service = 'tokenVoting-polygon-zkevm-testnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.plugin,
          interfaceType: 'tokenVoting',
          network: 'polygon-zkevm-testnet',
          pluginAddress: '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E',
        })
      })

      it('should handle lowercase addresses', () => {
        const service = 'gauge-ethereum-mainnet-0x69e8d5151d71d4cde35b5076af3023c7d54d379e'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.plugin,
          interfaceType: 'gauge',
          network: 'ethereum-mainnet',
          pluginAddress: '0x69e8d5151d71d4cde35b5076af3023c7d54d379e',
        })
      })

      it('should handle mixed case addresses', () => {
        const service = 'gauge-ethereum-mainnet-0x69E8d5151D71D4CdE35B5076aF3023C7d54D379e'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.deep.equal({
          indexerType: IndexerType.plugin,
          interfaceType: 'gauge',
          network: 'ethereum-mainnet',
          pluginAddress: '0x69E8d5151D71D4CdE35B5076aF3023C7d54D379e',
        })
      })
    })

    describe('invalid patterns', () => {
      it('should return null for invalid plugin type', () => {
        const service = 'invalidPlugin-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for missing address', () => {
        const service = 'gauge-ethereum-mainnet'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for invalid address format', () => {
        const service = 'gauge-ethereum-mainnet-invalid-address'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for empty string', () => {
        const result = AragonReQueueService.extractInfoFromServiceName('')

        expect(result).to.be.null
      })

      it('should return null for string without separators', () => {
        const service = 'gaugeethereummainnet0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for too many addresses', () => {
        const service =
          'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e-0x1234567890123456789012345678901234567890'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for addresses with wrong length', () => {
        const service = 'gauge-ethereum-mainnet-0x69E8D515'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should return null for addresses with invalid characters', () => {
        const service = 'gauge-ethereum-mainnet-0xG9E8D5151d71d4cde35b5076aF3023C7D54d379E'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })
    })

    describe('edge cases', () => {
      it('should handle service with only hyphens', () => {
        const service = '---'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should handle service with mixed valid/invalid parts', () => {
        const service = 'gauge-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E-ethereum-mainnet'
        const result = AragonReQueueService.extractInfoFromServiceName(service)

        expect(result).to.be.null
      })

      it('should handle undefined input', () => {
        const result = AragonReQueueService.extractInfoFromServiceName(undefined as any)

        expect(result).to.be.null
      })

      it('should handle null input', () => {
        const result = AragonReQueueService.extractInfoFromServiceName(null as any)

        expect(result).to.be.null
      })
    })
  })
})
