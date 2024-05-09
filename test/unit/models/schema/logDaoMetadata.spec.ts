import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import LogDaoMetadata from '@models/schema/logDaoMetadata'

describe('Model: LogDaoMetadata', () => {
  let sandbox: SinonSandbox
  let rawLogDaoMetadata: Partial<LogDaoMetadata>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawLogDaoMetadata = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      fetchedMetadata: true,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      trustedForwarder: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      daoURI: 'test',
      ens: 'fake-ens.eth',
      metadataUri: 'fake-uri',
      name: 'fake-name',
      description: 'fake-description',
      avatar: 'fake-avatar',
      links: [],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogDaoMetadata', async () => {
    it('Should create LogDaoMetadata', async () => {
      const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.transactionHash).to.eq(rawLogDaoMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogDaoMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogDaoMetadata.network)
      expect(createdLogDao.address).to.eq(rawLogDaoMetadata.address)
      expect(createdLogDao.creatorAddress).to.eq(rawLogDaoMetadata.creatorAddress)
      expect(createdLogDao.ens).to.eq(rawLogDaoMetadata.ens)
    })
  })

  it('Should update LogDaoMetadata', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    expect(createdLogDao.creatorAddress).to.eq(rawLogDaoMetadata.creatorAddress)

    await createdLogDao.update({
      daoURI: 'new-uri',
    })

    expect(createdLogDao.daoURI).to.eq('new-uri')
  })

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    const logDaoMetadata = await Models.LogDaoMetadata.findTxHash(createdLogDao.transactionHash)
    expect(logDaoMetadata?.address).to.eq(rawLogDaoMetadata.address)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogDaoMetadata.create(rawLogDaoMetadata)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawLogDaoMetadata.address)
  })
})
