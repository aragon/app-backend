import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogProposalMetadata from '@models/schema/logProposalMetadata'
import { Models } from '@dbModels'

describe('Model: LogProposalMetadata', () => {
  let sandbox: SinonSandbox
  let rawLogProposalMetadata: Partial<LogProposalMetadata>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1

    rawLogProposalMetadata = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      fetchedMetadata: true,
      pluginAddress,
      proposalId,
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
      const entityId = Models.LogProposalMetadata.getEntityId(
        rawLogProposalMetadata.transactionHash,
        rawLogProposalMetadata.pluginAddress,
        rawLogProposalMetadata.proposalId,
      )
      rawLogProposalMetadata.entityId = entityId
      const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawLogProposalMetadata.entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogProposalMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogProposalMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogProposalMetadata.network)
      expect(createdLogDao.fetchedMetadata).to.eq(rawLogProposalMetadata.fetchedMetadata)
      expect(createdLogDao.pluginAddress).to.eq(rawLogProposalMetadata.pluginAddress)
      expect(createdLogDao.proposalId).to.eq(rawLogProposalMetadata.proposalId)
      expect(createdLogDao.metadataUri).to.eq(rawLogProposalMetadata.metadataUri)
      expect(createdLogDao.title).to.eq(rawLogProposalMetadata.title)
      expect(createdLogDao.summary).to.eq(rawLogProposalMetadata.summary)
      expect(createdLogDao.description).to.eq(rawLogProposalMetadata.description)
      expect(createdLogDao.resources.length).to.eq(rawLogProposalMetadata.resources?.length)
      expect(createdLogDao.media.header).to.eq(rawLogProposalMetadata.media?.header)
      expect(createdLogDao.media.logo).to.eq(rawLogProposalMetadata.media?.logo)
    })

    it('Should create LogProposalMetadata without entity', async () => {
      const entityId = Models.LogProposalMetadata.getEntityId(
        rawLogProposalMetadata.transactionHash,
        rawLogProposalMetadata.pluginAddress,
        rawLogProposalMetadata.proposalId,
      )
      const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogProposalMetadata.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogProposalMetadata.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogProposalMetadata.network)
      expect(createdLogDao.fetchedMetadata).to.eq(rawLogProposalMetadata.fetchedMetadata)
      expect(createdLogDao.pluginAddress).to.eq(rawLogProposalMetadata.pluginAddress)
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

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const proposalId = 1
    const entityId = Models.LogProposalMetadata.getEntityId(transactionHash, pluginAddress, proposalId)
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}-${proposalId}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogProposalMetadata = await Models.LogProposalMetadata.create(rawLogProposalMetadata)
    const foundLogProposalMetadata = await Models.LogProposalMetadata.findExistingLog(
      createdLogProposalMetadata.transactionHash,
      createdLogProposalMetadata.pluginAddress,
      createdLogProposalMetadata.proposalId,
    )
    expect(foundLogProposalMetadata?.entityId).to.eq(createdLogProposalMetadata.entityId)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogProposalMetadata.create(rawLogProposalMetadata)
    await createdLogDao.reload()

    expect(createdLogDao.pluginAddress).to.eq(rawLogProposalMetadata.pluginAddress)
  })
})
