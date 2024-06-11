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
      network: NetworksEnum.mainnet,
      service: 'test-service',
      lastSync: 0,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create ConfigIndexer', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)

    expect(createdConfigIndexer.id).to.exist
    expect(createdConfigIndexer.network).to.eq(rawConfigIndexer.network)
    expect(createdConfigIndexer.service).to.eq(rawConfigIndexer.service)
    expect(createdConfigIndexer.lastSync).to.eq(rawConfigIndexer.lastSync)
  })

  it('Should getEntityId', async () => {
    const entityId = await Models.ConfigIndexer.getEntityId(rawConfigIndexer.network, rawConfigIndexer.service)
    expect(entityId).to.eq(`${rawConfigIndexer.network}-${rawConfigIndexer.service}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.ConfigIndexer.create(rawConfigIndexer)
    const foundLogDao = await Models.ConfigIndexer.findExistingLog(
      rawConfigIndexer.network,
      rawConfigIndexer.service,
    )
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.ConfigIndexer.create(rawConfigIndexer)
    const foundLogDao = await Models.ConfigIndexer.findByEntityId(createdLogDao.entityId)
    expect(foundLogDao?.entityId).to.eq(createdLogDao.entityId)
  })

  it('Should update ConfigIndexer', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    expect(createdConfigIndexer.lastSync).to.eq(rawConfigIndexer.lastSync)

    await createdConfigIndexer.update({
      lastSync: 11,
    })

    expect(createdConfigIndexer.lastSync).to.eq(11)
  })

  it('Should reload', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    await createdConfigIndexer.reload()

    expect(createdConfigIndexer.tokenAddress).to.eq(rawConfigIndexer.tokenAddress)
  })
})
