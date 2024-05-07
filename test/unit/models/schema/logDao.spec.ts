import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import LogDao from '@models/schema/logDao'

describe('Model: LogDao', () => {
  let sandbox: SinonSandbox
  let rawLogDao: Partial<LogDao>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawLogDao = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409 0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      creatorAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      ens: 'fake-ens.eth',
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogDao', async () => {
    it('Should create LogDao', async () => {
      const createdLogDao = await Models.LogDao.create(rawLogDao)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.transactionHash).to.eq(rawLogDao.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogDao.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogDao.network)
      expect(createdLogDao.address).to.eq(rawLogDao.address)
      expect(createdLogDao.creatorAddress).to.eq(rawLogDao.creatorAddress)
      expect(createdLogDao.ens).to.eq(rawLogDao.ens)
    })
  })

  it('Should update LogDao', async () => {
    const createdLogDao = await Models.LogDao.create(rawLogDao)
    expect(createdLogDao.creatorAddress).to.eq(rawLogDao.creatorAddress)

    await createdLogDao.update({
      creatorAddress: '0x558c9997f8d382f02dfce79e275af637d8bb19e1',
    })

    expect(createdLogDao.creatorAddress).to.eq('0x558c9997f8d382f02dfce79e275af637d8bb19e1')
  })

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogDao.create(rawLogDao)
    const logDao = await Models.LogDao.findTxHash(createdLogDao.transactionHash)
    expect(logDao?.address).to.eq(logDao.address)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogDao.create(rawLogDao)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogDao.address)
  })
})
