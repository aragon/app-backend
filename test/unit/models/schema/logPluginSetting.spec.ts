import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogPluginSetting from '@models/schema/logPluginSetting'
import { Models } from '@dbModels'

describe('Model: LogPluginSetting', () => {
  let sandbox: SinonSandbox
  let rawLogPluginSetting1: Partial<LogPluginSetting>
  let rawLogPluginSetting2: Partial<LogPluginSetting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogPluginSetting1 = {
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      pluginAddress,
      votingMode: 1,
      supportThreshold: 2,
      minParticipation: 2,
      minDuration: 213132213,
      minProposerVotingPower: 322,
    }

    const transactionHash2 = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress2 = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawLogPluginSetting2 = {
      transactionHash: transactionHash2,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      pluginAddress: pluginAddress2,
      onlyListed: true,
      minApprovals: 2,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogPluginSetting', async () => {
    it('Should create LogPluginSetting1', async () => {
      const entityId = Models.LogPluginSetting.getEntityId(
        rawLogPluginSetting1.transactionHash,
        rawLogPluginSetting1.pluginAddress,
      )
      rawLogPluginSetting1.entityId = entityId
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawLogPluginSetting1.entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetting1.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginSetting1.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginSetting1.network)
      expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)
      expect(createdLogDao.votingMode).to.eq(rawLogPluginSetting1.votingMode)
      expect(createdLogDao.supportThreshold).to.eq(rawLogPluginSetting1.supportThreshold)
      expect(createdLogDao.minParticipation).to.eq(rawLogPluginSetting1.minParticipation)
      expect(createdLogDao.minDuration).to.eq(rawLogPluginSetting1.minDuration)
      expect(createdLogDao.minProposerVotingPower).to.eq(rawLogPluginSetting1.minProposerVotingPower)
    })

    it('Should create LogPluginSetting1 without entityId', async () => {
      const entityId = Models.LogPluginSetting.getEntityId(
        rawLogPluginSetting1.transactionHash,
        rawLogPluginSetting1.pluginAddress,
      )
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetting1.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginSetting1.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginSetting1.network)
      expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)
      expect(createdLogDao.votingMode).to.eq(rawLogPluginSetting1.votingMode)
      expect(createdLogDao.supportThreshold).to.eq(rawLogPluginSetting1.supportThreshold)
      expect(createdLogDao.minParticipation).to.eq(rawLogPluginSetting1.minParticipation)
      expect(createdLogDao.minDuration).to.eq(rawLogPluginSetting1.minDuration)
      expect(createdLogDao.minProposerVotingPower).to.eq(rawLogPluginSetting1.minProposerVotingPower)
    })

    it('Should create LogPluginSetting2', async () => {
      const entityId = Models.LogPluginSetting.getEntityId(
        rawLogPluginSetting2.transactionHash,
        rawLogPluginSetting2.pluginAddress,
      )
      rawLogPluginSetting2.entityId = entityId
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting2)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(rawLogPluginSetting2.entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetting2.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginSetting2.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginSetting2.network)
      expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting2.pluginAddress)
      expect(createdLogDao.onlyListed).to.eq(rawLogPluginSetting2.onlyListed)
      expect(createdLogDao.minApprovals).to.eq(rawLogPluginSetting2.minApprovals)
    })

    it('Should create LogPluginSetting2 without entityId', async () => {
      const entityId = Models.LogPluginSetting.getEntityId(
        rawLogPluginSetting2.transactionHash,
        rawLogPluginSetting2.pluginAddress,
      )
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting2)

      expect(createdLogDao.id).to.exist
      expect(createdLogDao.entityId).to.eq(entityId)
      expect(createdLogDao.transactionHash).to.eq(rawLogPluginSetting2.transactionHash)
      expect(createdLogDao.blockNumber).to.eq(rawLogPluginSetting2.blockNumber)
      expect(createdLogDao.network).to.eq(rawLogPluginSetting2.network)
      expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting2.pluginAddress)
      expect(createdLogDao.onlyListed).to.eq(rawLogPluginSetting2.onlyListed)
      expect(createdLogDao.minApprovals).to.eq(rawLogPluginSetting2.minApprovals)
    })
  })

  it('Should update LogPluginSetting', async () => {
    const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)

    await createdLogDao.update({
      pluginAddress: '0x000',
    })

    expect(createdLogDao.pluginAddress).to.eq('0x000')
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'
    const entityId = Models.LogPluginSetting.getEntityId(transactionHash, pluginAddress)
    expect(entityId).to.eq(`${transactionHash}-${pluginAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetting = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    const foundLogPluginSetting = await Models.LogPluginSetting.findExistingLog(
      createdLogPluginSetting.transactionHash,
      createdLogPluginSetting.pluginAddress,
    )
    expect(foundLogPluginSetting?.entityId).to.eq(createdLogPluginSetting.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetting = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    const foundLogPluginSetting = await Models.LogPluginSetting.findByEntityId(createdLogPluginSetting.entityId)
    expect(foundLogPluginSetting?.entityId).to.eq(createdLogPluginSetting.entityId)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    await createdLogDao.reload()

    expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)
  })
})
