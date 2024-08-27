import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorDaoMetrics } from '@services/aragon-indexer/aggregator/daoMetrics'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { DaoList } from '@test/mock/fakeDao'
import { NetworksEnum } from '@types'
import LogDaoMetadata from '@models/schema/logDaoMetadata'

describe('Indexer:AggregatorDao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('updateDaoMetadata', async () => {
    it('should updateDaoMetadata', async () => {
      const document = { ...DaoList[1] }
      await Models.Dao.create(document as any)
    })
  })
})
