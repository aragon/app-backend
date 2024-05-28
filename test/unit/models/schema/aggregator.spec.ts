import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorTypeEnum } from '@types'
import Aggregator from '@models/schema/aggregator'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'

describe('Model: Aggregator', () => {
  let sandbox: SinonSandbox
  let rawAggregator: Partial<Aggregator>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawAggregator = {
      type: AggregatorTypeEnum.plugin,
      lastTimeSync: dayjs.utc().toDate(),
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Aggregator', async () => {
    it('Should create Aggregator', async () => {
      const createdAggregator = await Models.Aggregator.create(rawAggregator)

      expect(createdAggregator.lastTimeSync).to.exist
      expect(createdAggregator.type).to.eq(AggregatorTypeEnum.plugin)
    })
  })

  it('Should update Aggregator', async () => {
    const createdAggregator = await Models.Aggregator.create(rawAggregator)
    expect(createdAggregator.type).to.eq(AggregatorTypeEnum.plugin)

    await createdAggregator.update({
      type: AggregatorTypeEnum.settings,
    })

    expect(createdAggregator.type).to.eq(AggregatorTypeEnum.settings)
  })

  it('Should find Aggregator by type', async () => {
    const createdAggregator = await Models.Aggregator.create(rawAggregator)
    const aggregator = await Models.Aggregator.findByType(AggregatorTypeEnum.plugin)
    expect(aggregator?.type).to.eq(createdAggregator.type)
  })

  it('Should reload', async () => {
    const createdAggregator = await Models.Aggregator.create(rawAggregator)
    await createdAggregator.reload()

    expect(createdAggregator.type).to.eq(rawAggregator.type)
  })
})
