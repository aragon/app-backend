import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import LogPluginSetting from '@models/schema/logPluginSetting'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: LogPluginSetting', () => {
  let sandbox: SinonSandbox
  let rawLogPluginSetting1: Partial<LogPluginSetting>
  let rawLogPluginSetting2: Partial<LogPluginSetting>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    rawLogPluginSetting1 = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      votingMode: 1,
      supportThreshold: 2,
      minParticipation: 2,
      minDuration: 213132213,
      minProposerVotingPower: 322,
    }

    rawLogPluginSetting2 = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      onlyListed: true,
      minApprovals: 2,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogPluginSetting', async () => {
    it('Should create LogPluginSetting1', async () => {
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)

      expect(createdLogDao.id).to.exist
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
      const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting2)

      expect(createdLogDao.id).to.exist
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

  it('Should findTxHash', async () => {
    const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    const logPluginSetupProcessor = await Models.LogPluginSetting.findTxHash(
      createdLogDao.transactionHash,
      rawLogPluginSetting1.pluginAddress,
    )
    expect(logPluginSetupProcessor?.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.LogPluginSetting.create(rawLogPluginSetting1)
    await createdLogDao.reload()

    expect(createdLogDao.pluginAddress).to.eq(rawLogPluginSetting1.pluginAddress)
  })
})
