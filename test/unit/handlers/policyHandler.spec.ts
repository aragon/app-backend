import { Models } from '@dbModels'
import { PolicyHandler } from '@handlers/policyHandler'
import PolicyHelper from '@helpers/policyHelper'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { IEventLogPolicyType, IPolicySourceType, IPolicyStrategyType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Indexer: Policy Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('streamSourceSettingsUpdated', () => {
    it('should update setting with stream source data', async () => {
      const event = {
        args: {
          _vault: '0xVaultAddress',
          _vaultToken: '0xTokenAddress',
          _amountPerEpoch: BigInt(1000),
          _maxSourceBalance: BigInt(5000),
          _epochInterval: BigInt(3600),
        },
      } as any

      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: '0xTxHash',
        blockNumber: 1000,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          source: {
            type: IPolicySourceType.streamBalance,
          },
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(mockSetting as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.streamSourceSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.source as any).vaultAddress).to.eq('0xVaultAddress')
      expect((mockSetting.policy.source as any).tokenAddress).to.eq('0xTokenAddress')
      expect((mockSetting.policy.source as any).amountPerEpoch).to.eq('1000')
      expect((mockSetting.policy.source as any).maxSourceBalance).to.eq('5000')
      expect((mockSetting.policy.source as any).epochInterval).to.eq(3600)
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = { args: {} } as any
      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.streamSourceSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should warn if source type is not streamBalance', async () => {
      const event = { args: {} } as any
      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        policy: {
          source: {
            type: IPolicySourceType.drain,
          },
        },
      }

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(mockSetting as any)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.streamSourceSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('drainSourceSettingsUpdated', () => {
    it('should update setting with drain source data', async () => {
      const event = {
        args: {
          vault: '0xVaultAddress',
          vaultToken: '0xTokenAddress',
        },
      } as any

      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          source: {
            type: IPolicySourceType.drain,
          },
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(mockSetting as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.drainSourceSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.source as any).vaultAddress).to.eq('0xVaultAddress')
      expect((mockSetting.policy.source as any).tokenAddress).to.eq('0xTokenAddress')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = { args: {} } as any
      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.drainSourceSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('pluginDefined', () => {
    it('should log warning if no setting found', async () => {
      const event = {
        args: {
          plugin: '0xPluginAddress',
        },
      } as any

      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.pluginDefined(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should log error if plugin address mismatch', async () => {
      const event = {
        args: {
          plugin: '0xPluginAddress',
        },
      } as any

      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xDifferentPluginAddress',
      }

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(mockSetting as any)
      const loggerError = sandbox.stub(logger, 'error')

      await PolicyHandler.pluginDefined(event, info)

      expect(loggerError.calledOnce).to.be.true
    })

    it('should not log error if plugin address matches', async () => {
      const event = {
        args: {
          plugin: '0xPluginAddress',
        },
      } as any

      const info = {
        address: '0xSourceAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
      }

      sandbox.stub(Models.Setting, 'findByPolicySourceAddress').resolves(mockSetting as any)
      const loggerError = sandbox.stub(logger, 'error')

      await PolicyHandler.pluginDefined(event, info)

      expect(loggerError.called).to.be.false
    })
  })

  describe('ratioModelSettingsUpdated', () => {
    it('should update setting with ratio model data', async () => {
      const event = {
        args: {
          recipientList: ['0xRecipient1', '0xRecipient2'],
          ratioList: [BigInt(5000), BigInt(5000)],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          model: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.ratioModelSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).recipients).to.deep.eq(['0xRecipient1', '0xRecipient2'])
      expect((mockSetting.policy.model as any).ratios).to.deep.eq([5000, 5000])
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          recipientList: [],
          ratioList: [],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.ratioModelSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('equalRatioModelSettingsUpdated', () => {
    it('should update setting with equal ratio model data', async () => {
      const event = {
        args: {
          recipientList: ['0xRecipient1', '0xRecipient2', '0xRecipient3'],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          model: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.equalRatioModelSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).recipients).to.deep.eq(['0xRecipient1', '0xRecipient2', '0xRecipient3'])
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          recipientList: [],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.equalRatioModelSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('gaugeModelSettingsUpdated', () => {
    it('should update setting with gauge model data', async () => {
      const event = {
        args: {
          gaugeVoter: '0xGaugeVoterAddress',
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          model: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.gaugeModelSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).gaugeVoterAddress).to.eq('0xGaugeVoterAddress')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          gaugeVoter: '0xGaugeVoterAddress',
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.gaugeModelSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('bracketsModelSettingsUpdated', () => {
    it('should update setting with brackets model data', async () => {
      const event = {
        args: {
          brackets: [
            { threshold: BigInt(1000), routerModel: '0xRouterModel1', claimerModel: '0xClaimerModel1' },
            { threshold: BigInt(5000), routerModel: '0xRouterModel2', claimerModel: '0xClaimerModel2' },
          ],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          model: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.bracketsModelSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).brackets).to.deep.eq([
        { threshold: '1000', routerModelAddress: '0xRouterModel1', claimerModelAddress: '0xClaimerModel1' },
        { threshold: '5000', routerModelAddress: '0xRouterModel2', claimerModelAddress: '0xClaimerModel2' },
      ])
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          brackets: [],
        },
      } as any

      const info = {
        address: '0xModelAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findByPolicyModelAddress').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.bracketsModelSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('routerSettingsUpdated', () => {
    it('should handle uniswap router settings', async () => {
      const event = {
        args: ['0xUniswapRouter'],
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.uniswapRouter,
          swap: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      sandbox.stub(PolicyHelper, 'getUniswapTargetToken').resolves('0xTargetToken')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.routerSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.swap as any).uniswapRouter).to.eq('0xUniswapRouter')
      expect((mockSetting.policy.swap as any).targetTokenAddress).to.eq('0xTargetToken')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should handle standard router settings', async () => {
      const event = {
        args: ['0xModelAddress'],
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.router,
          model: null,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.routerSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).address).to.eq('0xModelAddress')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: ['0xModelAddress'],
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.routerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should warn for unexpected strategy type', async () => {
      const event = {
        args: ['0xModelAddress'],
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        policy: {
          strategyType: IPolicyStrategyType.claimer,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.routerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('claimerSettingsUpdated', () => {
    it('should update setting with claimer model', async () => {
      const event = {
        args: {
          _claimerModel: '0xModelAddress',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.claimer,
          model: null,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.claimerSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).address).to.eq('0xModelAddress')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should update existing model address', async () => {
      const event = {
        args: {
          _claimerModel: '0xNewModelAddress',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.claimer,
          model: {
            address: '0xOldModelAddress',
          },
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.claimerSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.model as any).address).to.eq('0xNewModelAddress')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          _claimerModel: '0xModelAddress',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.claimerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should warn if setting has wrong strategy type', async () => {
      const event = {
        args: {
          _claimerModel: '0xModelAddress',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.router,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.claimerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('multiRouterSettingsUpdated', () => {
    it('should update setting with subRouters', async () => {
      const event = {
        args: {
          subrouters: ['0xSubRouter1', '0xSubRouter2'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.multiRouter,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.multiRouterSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy as any).subRouters).to.deep.eq(['0xSubRouter1', '0xSubRouter2'])
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should set subRouters to null if empty array', async () => {
      const event = {
        args: {
          subrouters: [],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.multiDispatch,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      sandbox.stub(logger, 'info')

      await PolicyHandler.multiRouterSettingsUpdated(event, info)

      expect((mockSetting.policy as any).subRouters).to.be.null
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          subrouters: ['0xSubRouter1'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.multiRouterSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should warn if setting has wrong strategy type', async () => {
      const event = {
        args: {
          subrouters: ['0xSubRouter1'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.claimer,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.multiRouterSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('multiClaimerSettingsUpdated', () => {
    it('should update setting with subClaimers', async () => {
      const event = {
        args: {
          subclaimers: ['0xSubClaimer1', '0xSubClaimer2'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.multiClaimer,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.multiClaimerSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy as any).subClaimers).to.deep.eq(['0xSubClaimer1', '0xSubClaimer2'])
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should set subClaimers to null if empty array', async () => {
      const event = {
        args: {
          subclaimers: [],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.multiClaimer,
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      sandbox.stub(logger, 'info')

      await PolicyHandler.multiClaimerSettingsUpdated(event, info)

      expect((mockSetting.policy as any).subClaimers).to.be.null
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          subclaimers: ['0xSubClaimer1'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.multiClaimerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should warn if setting has wrong strategy type', async () => {
      const event = {
        args: {
          subclaimers: ['0xSubClaimer1'],
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.router,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.multiClaimerSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('cowSwapRouterSettingsUpdated', () => {
    it('should update setting with cowswap router data', async () => {
      const event = {
        args: {
          targetToken: '0xTargetToken',
          cowSwapSettlement: '0xSettlement',
          cowSwapRelayer: '0xRelayer',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      const mockSetting = {
        pluginAddress: '0xPluginAddress',
        policy: {
          strategyType: IPolicyStrategyType.cowSwapRouter,
          swap: {},
        },
        save: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler.cowSwapRouterSettingsUpdated(event, info)

      expect(mockSetting.save.calledOnce).to.be.true
      expect((mockSetting.policy.swap as any).targetTokenAddress).to.eq('0xTargetToken')
      expect((mockSetting.policy.swap as any).cowSwapSettlement).to.eq('0xSettlement')
      expect((mockSetting.policy.swap as any).cowSwapRelayer).to.eq('0xRelayer')
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should warn if no setting found', async () => {
      const event = {
        args: {
          targetToken: '0xTargetToken',
          cowSwapSettlement: '0xSettlement',
          cowSwapRelayer: '0xRelayer',
        },
      } as any

      const info = {
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const loggerWarn = sandbox.stub(logger, 'warn')

      await PolicyHandler.cowSwapRouterSettingsUpdated(event, info)

      expect(loggerWarn.calledOnce).to.be.true
    })
  })

  describe('_handleFactoryDeployment', () => {
    it('should create LogPolicy record', async () => {
      const event = {
        args: {
          newContract: '0xDeployedAddress',
        },
      } as any

      const info = {
        transactionHash: '0xTxHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 1000,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const createStub = sandbox.stub(Models.LogPolicy, 'create').resolves()
      const loggerInfo = sandbox.stub(logger, 'info')

      await PolicyHandler._handleFactoryDeployment(
        event,
        info,
        IEventLogPolicyType.DrainBalanceSourceDeployed,
        'newContract',
      )

      expect(createStub.calledOnce).to.be.true
      expect(
        createStub.calledWith({
          event: IEventLogPolicyType.DrainBalanceSourceDeployed,
          transactionHash: '0xTxHash',
          transactionIndex: 1,
          logIndex: 2,
          blockNumber: 1000,
          address: '0xDeployedAddress',
          network: NetworksEnum.ethereumSepolia,
        }),
      ).to.be.true
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should handle duplicate key error (11000)', async () => {
      const event = {
        args: {
          newContract: '0xDeployedAddress',
        },
      } as any

      const info = {
        transactionHash: '0xTxHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 1000,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const duplicateError = { code: 11000 }
      sandbox.stub(Models.LogPolicy, 'create').rejects(duplicateError)
      const loggerVerbose = sandbox.stub(logger, 'verbose')
      const loggerError = sandbox.stub(logger, 'error')

      await PolicyHandler._handleFactoryDeployment(
        event,
        info,
        IEventLogPolicyType.DrainBalanceSourceDeployed,
        'newContract',
      )

      expect(loggerVerbose.calledOnce).to.be.true
      expect(loggerError.called).to.be.false
    })

    it('should log error for non-duplicate errors', async () => {
      const event = {
        args: {
          newContract: '0xDeployedAddress',
        },
      } as any

      const info = {
        transactionHash: '0xTxHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 1000,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const otherError = { code: 500, message: 'Database error' }
      sandbox.stub(Models.LogPolicy, 'create').rejects(otherError)
      const loggerVerbose = sandbox.stub(logger, 'verbose')
      const loggerError = sandbox.stub(logger, 'error')

      await PolicyHandler._handleFactoryDeployment(
        event,
        info,
        IEventLogPolicyType.DrainBalanceSourceDeployed,
        'newContract',
      )

      expect(loggerVerbose.called).to.be.false
      expect(loggerError.calledOnce).to.be.true
    })
  })

  describe('Factory deployment handlers', () => {
    it('drainBalanceSourceDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.drainBalanceSourceDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.DrainBalanceSourceDeployed, 'newContract')).to.be
        .true
    })

    it('requiredBalanceSourceDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.requiredBalanceSourceDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.RequiredBalanceSourceDeployed, 'newContract')).to.be
        .true
    })

    it('streamBalanceSourceDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.streamBalanceSourceDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.StreamBalanceSourceDeployed, 'newContract')).to.be
        .true
    })

    it('fixedBalanceSourceDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.fixedBalanceSourceDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.FixedBalanceSourceDeployed, 'newContract')).to.be
        .true
    })

    it('ratioModelDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.ratioModelDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.RatioModelDeployed, 'newContract')).to.be.true
    })

    it('equalRatioModelDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.equalRatioModelDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.EqualRatioModelDeployed, 'newContract')).to.be.true
    })

    it('bracketsModelDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.bracketsModelDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.BracketsModelDeployed, 'newContract')).to.be.true
    })

    it('addressGaugeRatioModelDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.addressGaugeRatioModelDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.AddressGaugeRatioModelDeployed, 'newContract')).to
        .be.true
    })

    it('tokenGaugeRatioModelDeployed should call _handleFactoryDeployment', async () => {
      const event = { args: { newContract: '0xAddress' } } as any
      const info = { network: NetworksEnum.ethereumSepolia } as any

      const handleStub = sandbox.stub(PolicyHandler, '_handleFactoryDeployment').resolves()

      await PolicyHandler.tokenGaugeRatioModelDeployed(event, info)

      expect(handleStub.calledOnce).to.be.true
      expect(handleStub.calledWith(event, info, IEventLogPolicyType.TokenGaugeRatioModelDeployed, 'newContract')).to.be
        .true
    })
  })
})
