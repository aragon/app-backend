import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogPluginRepo from '@models/schema/logPluginRepo'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: LogPluginRepo', () => {
  let sandbox: SinonSandbox
  let rawLogPluginRepo: Partial<LogPluginRepo>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

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
      const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginRepo.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginRepo.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginRepo.network)
      expect(createdLogDao.address).to.eq(rawLogPluginRepo.address)
      expect(createdLogDao.creatorAddress).to.eq(rawLogPluginRepo.creatorAddress)
      expect(createdLogDao.ens).to.eq(rawLogPluginRepo.ens)
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

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)
    const logPluginRepo = await Models.LogPluginRepo.findTxHash(createdLogDao.transactionHash)
    expect(logPluginRepo?.address).to.eq(rawLogPluginRepo.address)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginRepo.create(rawLogPluginRepo)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogPluginRepo.address)
  })
})
