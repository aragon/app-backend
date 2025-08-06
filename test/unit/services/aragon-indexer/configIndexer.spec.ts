import { expect } from 'chai'
import { Interface } from 'ethers'
import ConfigIndexer from '@services/aragon-indexer/configIndexer'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { Multisig } from '@artifacts/Multisig'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'

describe('ConfigIndexer', () => {
  it('should be an array of configurations', () => {
    expect(ConfigIndexer).to.be.an('array')
    expect(ConfigIndexer.length).to.be.greaterThan(0)
  })

  describe('Configuration structure', () => {
    it('should have required properties for each config', () => {
      ConfigIndexer.forEach((config, index) => {
        expect(config.event, `Config at index ${index} missing event`).to.be.a('string')
        expect(config.enableHistorical, `Config at index ${index} missing enableHistorical`).to.be.a('boolean')
        // Topic can be either a string or an array of strings
        if (Array.isArray(config.topic)) {
          expect(config.topic, `Config at index ${index} topic array is empty`).to.have.length.greaterThan(0)
          config.topic.forEach((topic, topicIndex) => {
            expect(topic, `Config at index ${index} topic[${topicIndex}] is not a string`).to.be.a('string')
            expect(topic, `Config at index ${index} topic[${topicIndex}] has invalid format`).to.match(
              /^0x[a-fA-F0-9]{64}$/,
            )
          })
        } else {
          expect(config.topic, `Config at index ${index} missing topic`).to.be.a('string')
          expect(config.topic, `Config at index ${index} has invalid topic`).to.match(/^0x[a-fA-F0-9]{64}$/)
        }
        expect(config.config, `Config at index ${index} missing config`).to.be.an('array')

        // Allow empty config array for specific events like Transfer
        if (config.event !== 'Transfer') {
          expect(config.config.length, `Config at index ${index} has empty config`).to.be.greaterThan(0)
        }

        config.config.forEach((handlerConfig, handlerIndex) => {
          expect(handlerConfig.abi, `Handler config at ${index}.${handlerIndex} missing abi`).to.be.an('array')
          expect(handlerConfig.handler, `Handler config at ${index}.${handlerIndex} missing handler`).to.be.a(
            'function',
          )
        })
      })
    })

    it('should have valid topic hashes', () => {
      // Test specific known topic hashes
      const daoRegisteredConfig = ConfigIndexer.find(c => c.event === 'DAORegistered')
      expect(daoRegisteredConfig).to.exist
      expect(daoRegisteredConfig!.topic).to.equal(new Interface(DAORegistry.abi).getEvent('DAORegistered')?.topicHash)

      const installationPreparedConfig = ConfigIndexer.find(c => c.event === 'InstallationPrepared')
      expect(installationPreparedConfig).to.exist
      expect(installationPreparedConfig!.topic).to.equal(
        new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash,
      )
    })
  })

  describe('Event uniqueness', () => {
    it('should have unique event names', () => {
      const eventNames = ConfigIndexer.map(config => config.event)
      const uniqueEventNames = new Set(eventNames)
      expect(uniqueEventNames.size).to.equal(eventNames.length)
    })

    it('should have unique topic hashes', () => {
      const topics: string[] = []
      ConfigIndexer.forEach(config => {
        if (Array.isArray(config.topic)) {
          topics.push(...config.topic)
        } else {
          topics.push(config.topic)
        }
      })
      const uniqueTopics = new Set(topics)
      expect(uniqueTopics.size).to.equal(topics.length)
    })
  })

  describe('Historical vs Realtime events', () => {
    it('should have correct historical events enabled', () => {
      const historicalEvents = [
        'PluginRepoRegistered',
        'DAORegistered',
        'InstallationPrepared',
        'InstallationApplied',
        'UpdateApplied',
        'UpdatePrepared',
        'UninstallationApplied',
        'UninstallationPrepared',
        'MetadataSet',
      ]

      historicalEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `${eventName} not found`).to.exist
        expect(config!.enableHistorical, `${eventName} should have historical enabled`).to.be.true
      })
    })

    it('should have correct realtime-only events', () => {
      const realtimeOnlyEvents = [
        'MultisigSettingsUpdated',
        'VotingSettingsUpdated',
        'ProposalCreated',
        'ProposalExecuted',
        'VoteCast',
        'Transfer',
        'SelectorAllowed',
        'SelectorDisallowed',
      ]

      realtimeOnlyEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `${eventName} not found`).to.exist
        expect(config!.enableHistorical, `${eventName} should have historical disabled`).to.be.false
      })
    })
  })

  describe('Handler configurations', () => {
    it('should have multiple handlers for specific events', () => {
      // Test Transfer event has empty config (intentionally)
      const transferConfig = ConfigIndexer.find(c => c.event === 'Transfer')
      expect(transferConfig).to.exist
      expect(transferConfig!.config.length).to.equal(0)

      // Test NativeTokenDeposited has multiple handlers
      const nativeTokenConfig = ConfigIndexer.find(c => c.event === 'NativeTokenDeposited')
      expect(nativeTokenConfig).to.exist
      expect(nativeTokenConfig!.config.length).to.equal(2)

      // Test MultisigSettingsUpdated has multiple handlers
      const multisigSettingsConfig = ConfigIndexer.find(c => c.event === 'MultisigSettingsUpdated')
      expect(multisigSettingsConfig).to.exist
      expect(multisigSettingsConfig!.config.length).to.equal(2)
    })

    it('should have correct ABI associations', () => {
      // Test Multisig events use Multisig ABI
      const multisigEvents = ['MembersAdded', 'MembersRemoved', 'Approved']
      multisigEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config).to.exist
        expect(config!.config[0].abi).to.equal(Multisig.abi)
      })

      // Test TokenVoting events use TokenVoting ABI
      const tokenVotingEvents = ['VotingSettingsUpdated', 'VoteCast']
      tokenVotingEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config).to.exist
        expect(config!.config[0].abi).to.equal(TokenVoting.abi)
      })
    })
  })

  describe('ExecuteSelectorCondition events', () => {
    it('should have all ExecuteSelectorCondition events configured', () => {
      const selectorEvents = [
        'SelectorAllowed',
        'SelectorDisallowed',
        'NativeTransfersAllowed',
        'NativeTransfersDisallowed',
      ]

      selectorEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `${eventName} should be configured`).to.exist
        expect(config!.config[0].abi).to.equal(ExecuteSelectorCondition.abi)
        expect(config!.enableHistorical).to.be.false
      })
    })

    it('should have correct topic hashes for selector events', () => {
      const selectorAllowedConfig = ConfigIndexer.find(c => c.event === 'SelectorAllowed')
      expect(selectorAllowedConfig!.topic).to.equal(
        new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorAllowed')?.topicHash,
      )

      const nativeTransfersAllowedConfig = ConfigIndexer.find(c => c.event === 'NativeTransfersAllowed')
      expect(nativeTransfersAllowedConfig!.topic).to.equal(
        new Interface(ExecuteSelectorCondition.abi).getEvent('NativeTransfersAllowed')?.topicHash,
      )
    })
  })

  describe('Handler function references', () => {
    it('should have valid handler function references', () => {
      ConfigIndexer.forEach((config, index) => {
        config.config.forEach((handlerConfig, handlerIndex) => {
          expect(handlerConfig.handler, `Handler at ${index}.${handlerIndex} should be a function`).to.be.a('function')
          expect(handlerConfig.handler.name, `Handler at ${index}.${handlerIndex} should have a name`).to.not.be.empty
        })
      })
    })
  })

  describe('Event categories', () => {
    it('should have all DAO-related events', () => {
      const daoEvents = ['DAORegistered', 'MetadataSet', 'NativeTokenDeposited', 'Granted', 'Revoked']
      daoEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `DAO event ${eventName} should exist`).to.exist
      })
    })

    it('should have all Plugin-related events', () => {
      const pluginEvents = [
        'PluginRepoRegistered',
        'InstallationPrepared',
        'InstallationApplied',
        'UpdateApplied',
        'UpdatePrepared',
        'UninstallationApplied',
        'UninstallationPrepared',
      ]
      pluginEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `Plugin event ${eventName} should exist`).to.exist
      })
    })

    it('should have all Governance-related events', () => {
      const governanceEvents = [
        'ProposalCreated',
        'ProposalExecuted',
        'ProposalCanceled',
        'ProposalEdited',
        'ProposalAdvanced',
        'VoteCast',
        'Approved',
      ]
      governanceEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `Governance event ${eventName} should exist`).to.exist
      })
    })

    it('should have all VE (Voting Escrow) events', () => {
      const veEvents = [
        'Deposit',
        'Withdraw',
        'MinDepositSet',
        'ExitQueued',
        'MinLockSet',
        'TokensDelegated',
        'TokensUndelegated',
      ]
      veEvents.forEach(eventName => {
        const config = ConfigIndexer.find(c => c.event === eventName)
        expect(config, `VE event ${eventName} should exist`).to.exist
      })
    })
  })
})
