import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogPluginRepo from '@models/schema/logPluginRepo'
import { Models } from '@dbModels'

describe('Model: LogPluginRepo', () => {
  let sandbox: SinonSandbox
  let rawLogPluginRepo: Partial<LogPluginRepo>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogPluginRepo = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      subdomain: 'fake-ens.eth',
      pluginRepo: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogPluginRepo', async () => {
    it('Should create LogPluginRepo', async () => {
      const entityId = Models.LogPluginRepo.getEntityId(rawLogPluginRepo.transactionHash, rawLogPluginRepo.pluginRepo)
      rawLogPluginRepo.id = entityId
      const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)

      expect(createdLogDao.id).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginRepo.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginRepo.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginRepo.network)
      expect(createdLogDao.pluginRepo).to.eq(rawLogPluginRepo.pluginRepo)
      expect(createdLogDao.subdomain).to.eq(rawLogPluginRepo.subdomain)
    })

    it('Should create LogPluginRepo without entityId', async () => {
      const entityId = Models.LogPluginRepo.getEntityId({
        transactionHash: rawLogPluginRepo.transactionHash!,
        pluginRepo: rawLogPluginRepo.pluginRepo!,
      })
      const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)

      expect(createdLogDao.id).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginRepo.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginRepo.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginRepo.network)
      expect(createdLogDao.pluginRepo).to.eq(rawLogPluginRepo.pluginRepo)
      expect(createdLogDao.subdomain).to.eq(rawLogPluginRepo.subdomain)
    })
  })

  it('Should update LogPluginRepo', async () => {
    const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)
    expect(createdLogDao.creatorAddress).to.eq(rawLogPluginRepo.creatorAddress)

    await createdLogDao.update({
      subdomain: 'new-subdomain',
    })

    expect(createdLogDao.subdomain).to.eq('new-subdomain')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginRepo = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const entityId = Models.LogPluginRepo.getEntityId({ transactionHash, pluginRepo })
    expect(entityId).to.eq(`${transactionHash}-${pluginRepo}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginRepo = await Models.LogPluginRepo.create(rawLogPluginRepo)
    const foundLogPluginRepo = await Models.LogPluginRepo.findExistingLog({
      transactionHash: createdLogPluginRepo.transactionHash,
      pluginRepo: createdLogPluginRepo.pluginRepo,
    })
    expect(foundLogPluginRepo?.id).to.eq(createdLogPluginRepo.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginRepo = await Models.LogPluginRepo.create(rawLogPluginRepo)
    const foundLogPluginRepo = await Models.LogPluginRepo.findByEntityId(createdLogPluginRepo.id)
    expect(foundLogPluginRepo?.id).to.eq(createdLogPluginRepo.id)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogPluginRepo.address)
  })
})
