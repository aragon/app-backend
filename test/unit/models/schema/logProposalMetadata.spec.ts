import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogProposalMetadata from '@models/schema/logProposalMetadata'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: LogProposalMetadata', () => {
  let sandbox: SinonSandbox
  let rawLogProposalMetadata: Partial<LogProposalMetadata>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawLogProposalMetadata = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      fetchedMetadata: true,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      proposalId: 1,
      metadataUri: 'test-uri',
      title: 'some-title',
      summary: 'some-summary',
      description: 'some-description',
      resources: [],
      media: {
        header: 'some-header',
        logo: 'some-logo',
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogProposalMetadata', async () => {
    it('Should create LogProposalMetadata', async () => {
      const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.transactionHash).to.eq(rawLogProposalMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogProposalMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogProposalMetadata.network)
      expect(createdLogDao.fetchedMetadata).to.eq(rawLogProposalMetadata.fetchedMetadata)
      expect(createdLogDao.daoAddress).to.eq(rawLogProposalMetadata.daoAddress)
      expect(createdLogDao.proposalId).to.eq(rawLogProposalMetadata.proposalId)
      expect(createdLogDao.metadataUri).to.eq(rawLogProposalMetadata.metadataUri)
      expect(createdLogDao.title).to.eq(rawLogProposalMetadata.title)
      expect(createdLogDao.summary).to.eq(rawLogProposalMetadata.summary)
      expect(createdLogDao.description).to.eq(rawLogProposalMetadata.description)
      expect(createdLogDao.resources.length).to.eq(rawLogProposalMetadata.resources?.length)
      expect(createdLogDao.media.header).to.eq(rawLogProposalMetadata.media?.header)
      expect(createdLogDao.media.logo).to.eq(rawLogProposalMetadata.media?.logo)
    })
  })

  it('Should update LogProposalMetadata', async () => {
    const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)
    expect(createdLogDao.plugin).to.eq(rawLogProposalMetadata.plugin)

    await createdLogDao.update({
      proposalId: 2,
    })

    expect(createdLogDao.proposalId).to.eq(2)
  })

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)
    const logProposalMetadata = await Models.LogProposalMetadata.findTxHash(createdLogDao.transactionHash)
    expect(logProposalMetadata?.daoAddress).to.eq(rawLogProposalMetadata.daoAddress)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)
    await createdLogDao.reload()

    expect(createdLogDao.daoAddress).to.eq(rawLogProposalMetadata.daoAddress)
  })
})
