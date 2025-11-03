import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import ConfigIndexer from '@models/schema/configIndexer'

describe('Model: ConfigIndexer', () => {
  let sandbox: SinonSandbox
  let rawConfigIndexer: Partial<ConfigIndexer>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawConfigIndexer = {
      network: NetworksEnum.ethereumMainnet,
      service: 'test-service' as any,
      lastSync: 0,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create ConfigIndexer', async () => {
    const entityId = Models.ConfigIndexer.getEntityId({
      network: rawConfigIndexer.network!,
      service: rawConfigIndexer.service!,
    })
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)

    expect(createdConfigIndexer.id).to.eq(entityId)
    expect(createdConfigIndexer.network).to.eq(rawConfigIndexer.network)
    expect(createdConfigIndexer.service).to.eq(rawConfigIndexer.service)
    expect(createdConfigIndexer.lastSync).to.eq(rawConfigIndexer.lastSync)
  })

  it('Should getEntityId', async () => {
    const entityId = Models.ConfigIndexer.getEntityId({
      network: rawConfigIndexer.network!,
      service: rawConfigIndexer.service!,
    })
    expect(entityId).to.eq(`${rawConfigIndexer.network}-${rawConfigIndexer.service}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.ConfigIndexer.create(rawConfigIndexer)
    const foundLogDao = await Models.ConfigIndexer.findExistingLog({
      network: rawConfigIndexer.network!,
      service: rawConfigIndexer.service!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.ConfigIndexer.create(rawConfigIndexer)
    const foundLogDao = await Models.ConfigIndexer.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should update ConfigIndexer', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    expect(createdConfigIndexer.lastSync).to.eq(rawConfigIndexer.lastSync)

    await createdConfigIndexer.update({
      lastSync: 11,
    })

    expect(createdConfigIndexer.lastSync).to.eq(11)
  })

  it('Should not update required field with falsy value', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    const originalService = createdConfigIndexer.service

    // Try to update required field with null - should not update
    await createdConfigIndexer.update({
      service: null as any,
    })

    expect(createdConfigIndexer.service).to.eq(originalService)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)

    // Try to update with non-existent field
    await createdConfigIndexer.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(createdConfigIndexer).to.exist
  })

  it('Should reload', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    await createdConfigIndexer.reload()

    expect(createdConfigIndexer.tokenAddress).to.eq(rawConfigIndexer.tokenAddress)
  })
})
