import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import ConfigIndexer from '@models/schema/configIndexer'

describe('Model: ConfigIndexer', () => {
  let sandbox: SinonSandbox
  let rawConfigIndexer: Partial<ConfigIndexer>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawConfigIndexer = {
      network: NetworksEnum.ethereumMainnet,
      service: 'test-service',
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

  it('Should reload', async () => {
    const createdConfigIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
    await createdConfigIndexer.reload()

    expect(createdConfigIndexer.tokenAddress).to.eq(rawConfigIndexer.tokenAddress)
  })
  it('should dismantle service and network from id', async () => {
    const text = `dao-${NetworksEnum.chilizMainnet}-0x1234567890abcdef1234567890abcdef12345678`
    const { service, network, address } = Models.ConfigIndexer.extractInfoFromServiceName(text)
    expect(service).to.be.eq('dao')
    expect(network).to.be.eq(NetworksEnum.chilizMainnet)
    expect(address).to.be.eq('0x1234567890abcdef1234567890abcdef12345678')
  })

  it('should dismantle plugin service and network from id', async () => {
    const text = `${IPluginInterfaceType.tokenVoting}-${NetworksEnum.ethereumMainnet}-0x1234567890abcdef1234567890abcdef12345678`
    const { service, network, address, interfaceType } = Models.ConfigIndexer.extractInfoFromServiceName(text)
    expect(service).to.be.eq('plugin')
    expect(network).to.be.eq(NetworksEnum.ethereumMainnet)
    expect(address).to.be.eq('0x1234567890abcdef1234567890abcdef12345678')
    expect(interfaceType).to.be.eq(IPluginInterfaceType.tokenVoting)
  })

  it('should return null if service name does not match expected format', async () => {
    const text = 'invalid-servicename-0x1234567890abcdef1234567890abcdef12345678'
    const result = Models.ConfigIndexer.extractInfoFromServiceName(text)
    expect(result).to.be.null
  })
})
