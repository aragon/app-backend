import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Models } from '@dbModels'
// import { expect } from 'chai'
// import migrateDaoMemberMapping from '@src/migrations/20250718012152-daoMemberMapping'
// import { startSession, connection } from 'mongoose'

describe('migration: daoMemberMapping', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('migrateTokenConfigIndexer', () => {
    it('should migrate token config indexer', async () => {
      // const TempModel = connection.model(tempCollectionName, Models.DaoMemberMapping.schema)

      const dbData = [
        {
          _id: '67d2d171c9f534a349626149',
          network: 'polygon-mainnet',
          memberAddress: '0xa1C923443301D3764E7Bf5e8aC5E9541440C3b74',
          daoAddress: '0x6a8B81fFA31a9C04fb61e5Ac33AAA67429260919',
          pluginAddress: '0xF9fE9Ba9Ac9bf9Caa77863b302bB5f28154f6a44',
          tokenAddress: '0x02249DC5Abbe23578b046EEe9Ce89D042FfC1301',
          createdAt: '2025-03-13T12:37:05.523+0000',
          updatedAt: '2025-03-13T12:37:05.523+0000',
          __v: 0,
        },
      ]

      await Promise.all(dbData.map(async data => Models.ConfigIndexer.create(data)))
    })
  })
})
