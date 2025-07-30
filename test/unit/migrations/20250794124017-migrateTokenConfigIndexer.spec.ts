import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Models } from '@dbModels'
import { expect } from 'chai'
import migrateTokenConfigIndexerMigration from '@src/migrations/20250794124017-migrateTokenConfigIndexer'

describe('migration: migrateTokenConfigIndexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('migrateTokenConfigIndexer', () => {
    it('should migrate token config indexer', async () => {
      const dbData = [
        {
          id: 'ethereum-mainnet-gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E-0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
          network: 'ethereum-mainnet',
          service:
            'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E-0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
          lastSync: 22082879,
        },
        {
          id: 'polygon-mainnet-tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7-0xff602165c513E1B73eB644525497521873e923AD',
          network: 'polygon-mainnet',
          service:
            'tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7-0xff602165c513E1B73eB644525497521873e923AD',
          lastSync: 68998403,
        },
        {
          id: 'ethereum-sepolia-tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
          network: 'ethereum-sepolia',
          service: 'tokenVoting-ethereum-sepolia-0x01239b4E29691BB81F9BAdF8525Ae744Cc7B83C1',
          lastSync: 7893826,
        },
        {
          id: 'base-mainnet-tokenVoting-base-mainnet-0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          network: 'base-mainnet',
          service:
            'tokenVoting-base-mainnet-0x5011b031C7530B6aBd9fF8554AEeaAC7f962dDB7-0xA5148e8fA0CA950dEaAE6422e32149d361708e2e',
          lastSync: 27556510,
        },
        {
          id: 'zksync-sepolia-tokenVoting-zksync-sepolia-0xb9693D4397E23745dfFB21Ef39095275778e1c09-0x9f1bbA96d539E467F3822ABd07C4eb5Fc001CE2c',
          network: 'zksync-sepolia',
          service:
            'tokenVoting-zksync-sepolia-0xb9693D4397E23745dfFB21Ef39095275778e1c09-0x9f1bbA96d539E467F3822ABd07C4eb5Fc001CE2c',
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

      const spyConfigName = sandbox.spy(migrateTokenConfigIndexerMigration, 'extractInfoFromServiceName')

      await migrateTokenConfigIndexerMigration.start()

      const docs = await Models.ConfigIndexer.find().lean().exec()

      docs.map((doc: any) => {
        expect(doc.id).to.eq(Models.ConfigIndexer.getEntityId({ network: doc.network, service: doc.service }))
      })
      expect(spyConfigName.callCount).to.equal(5) // not 6 as it should skip all plugins config
    })

    it('should migrate transferList config indexer', async () => {
      const stubData = {
        id: 'transferList-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-corn-mainnet',
        network: 'corn-mainnet',
        service: 'transferList-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-corn-mainnet',
        lastSync: 12345678,
      }

      await Models.ConfigIndexer.create(stubData)

      const spyConfigName = sandbox.spy(migrateTokenConfigIndexerMigration, 'extractInfoFromServiceName')

      await migrateTokenConfigIndexerMigration.start()

      const updatedDoc = await Models.ConfigIndexer.findOne({ network: stubData.network }).lean()

      const expectedService = `transferList-${stubData.network}-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e`

      // Expect updated id to match builder logic
      expect(updatedDoc?.id).to.eq(
        Models.ConfigIndexer.getEntityId({ network: updatedDoc.network, service: expectedService }),
      )

      // Expect correct service format was applied
      expect(updatedDoc?.service).to.eq(expectedService)

      // extractInfoFromServiceName must have been called
      expect(spyConfigName.called).to.be.true
    })

    it('should migrate deposit config indexer', async () => {
      const stubData = [
        {
          id: 'deposit-0x0FE96b4D862981C39D6cA9f5c8d58d6d92AaB8dA-depositTxs',
          network: 'ethereum-mainnet',
          service: 'deposit-0x0FE96b4D862981C39D6cA9f5c8d58d6d92AaB8dA-depositTxs',
          lastSync: 12345678,
        },
        {
          id: 'deposit-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-depositTxs',
          network: 'polygon-mainnet',
          service: 'deposit-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-depositTxs',
          lastSync: 87654321,
        },
        {
          id: 'deposit-0xABCDEF1234567890abcdef1234567890ABCDEF12-depositTxs',
          network: 'base-mainnet',
          service: 'deposit-0xABCDEF1234567890abcdef1234567890ABCDEF12-depositTxs',
          lastSync: 11111111,
        },
      ]

      await Promise.all(stubData.map(data => Models.ConfigIndexer.create(data)))

      const spyConfigName = sandbox.spy(migrateTokenConfigIndexerMigration, 'extractInfoFromServiceName')

      await migrateTokenConfigIndexerMigration.start()

      const updatedDocs = await Models.ConfigIndexer.find({ service: /deposit/ }).lean()

      expect(updatedDocs).to.have.lengthOf(3)

      updatedDocs.forEach(doc => {
        // Extract the address from the service string
        const parts = doc.service.split('-')
        const addressIndex = parts.findIndex(part => part.startsWith('0x'))
        const address = parts[addressIndex]

        const expectedService = `deposit-${doc.network}-${address}-depositTxs`

        // Expect updated id to match builder logic
        expect(doc.id).to.eq(Models.ConfigIndexer.getEntityId({ network: doc.network, service: expectedService }))

        // Expect correct service format was applied
        expect(doc.service).to.eq(expectedService)

        // Verify the network is included in the new format
        expect(doc.service).to.include(doc.network)

        // Verify it matches the expected pattern
        expect(doc.service).to.match(/^deposit-[a-z-]+-0x[a-fA-F0-9]+-depositTxs$/)
      })

      // extractInfoFromServiceName must have been called for each document
      expect(spyConfigName.callCount).to.be.at.least(3)
    })

    it('should migrate withdraw config indexer', async () => {
      const stubData = [
        {
          id: 'withdraw-0x0FE96b4D862981C39D6cA9f5c8d58d6d92AaB8dA-withdrawTxs',
          network: 'ethereum-mainnet',
          service: 'withdraw-0x0FE96b4D862981C39D6cA9f5c8d58d6d92AaB8dA-withdrawTxs',
          lastSync: 12345678,
        },
        {
          id: 'withdraw-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-withdrawTxs',
          network: 'polygon-mainnet',
          service: 'withdraw-0x171CDE93e3021A5ac90E28d9237d0244E653bC8e-withdrawTxs',
          lastSync: 87654321,
        },
        {
          id: 'withdraw-0xABCDEF1234567890abcdef1234567890ABCDEF12-withdrawTxs',
          network: 'arbitrum-mainnet',
          service: 'withdraw-0xABCDEF1234567890abcdef1234567890ABCDEF12-withdrawTxs',
          lastSync: 11111111,
        },
      ]

      await Promise.all(stubData.map(data => Models.ConfigIndexer.create(data)))

      const spyConfigName = sandbox.spy(migrateTokenConfigIndexerMigration, 'extractInfoFromServiceName')

      await migrateTokenConfigIndexerMigration.start()

      const updatedDocs = await Models.ConfigIndexer.find({ service: /withdraw/ }).lean()

      expect(updatedDocs).to.have.lengthOf(3)

      updatedDocs.forEach(doc => {
        // Extract the address from the service string
        const parts = doc.service.split('-')
        const addressIndex = parts.findIndex(part => part.startsWith('0x'))
        const address = parts[addressIndex]

        const expectedService = `withdraw-${doc.network}-${address}-withdrawTxs`

        // Expect updated id to match builder logic
        expect(doc.id).to.eq(Models.ConfigIndexer.getEntityId({ network: doc.network, service: expectedService }))

        // Expect correct service format was applied
        expect(doc.service).to.eq(expectedService)

        // Verify the network is included in the new format
        expect(doc.service).to.include(doc.network)

        // Verify it matches the expected pattern
        expect(doc.service).to.match(/^withdraw-[a-z-]+-0x[a-fA-F0-9]+-withdrawTxs$/)
      })

      // extractInfoFromServiceName must have been called for each document
      expect(spyConfigName.callCount).to.be.at.least(3)
    })
  })
})
