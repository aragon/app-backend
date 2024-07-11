import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITokenType, NetworksEnum } from '@types'
import Setting from '@models/schema/setting'
import { Models } from '@dbModels'

describe('Model: Setting', () => {
  let sandbox: SinonSandbox
  let rawSetting: Partial<Setting>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rawSetting = {
      daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
      pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
      network: NetworksEnum.polygonMainnet,
      fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef8',
      toTxHash: '0x11ed65ce6ba3dbed7194ead9d3ffdfafdb921f39b1e55bd5139f0277ea219083',
      fromBlockNumber: 47758873,
      toBlockNumber: 48097896,
      settings: {
        votingMode: 1,
        supportThreshold: 500000,
        minParticipation: 150000,
        minDuration: 86400,
        minProposerVotingPower: '5e+18',

        minApprovals: 1,
        onlyListed: true,
      },
      token: {
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc9',
        symbol: 'Test',
        name: 'Test Token',
        type: ITokenType.GovernanceERC20,
        logo: 'fake-logo',
        decimals: 18,
        totalSupply: '1000000000000000000000000000',
        network: NetworksEnum.polygonMainnet,
      },
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Setting', async () => {
    it('Should create Setting', async () => {
      rawSetting.id = Models.Setting.getEntityId({ fromTxHash: rawSetting.fromTxHash!, network: rawSetting.network! })
      const createdLogDao = await Models.Setting.create(rawSetting)

      expect(createdLogDao.id).to.eq(rawSetting.id)
      expect(createdLogDao.pluginAddress).to.eq(rawSetting.pluginAddress)
      expect(createdLogDao.network).to.eq(rawSetting.network)

      expect(createdLogDao.fromTxHash).to.eq(rawSetting?.fromTxHash)
      expect(createdLogDao.toTxHash).to.eq(rawSetting?.toTxHash)
      expect(createdLogDao.fromBlockNumber).to.eq(rawSetting?.fromBlockNumber)
      expect(createdLogDao.toBlockNumber).to.eq(rawSetting?.toBlockNumber)
      expect(createdLogDao.settings.votingMode).to.eq(rawSetting?.settings?.votingMode)
      expect(createdLogDao.settings.supportThreshold).to.eq(rawSetting?.settings?.supportThreshold)
      expect(createdLogDao.settings.minParticipation).to.eq(rawSetting?.settings?.minParticipation)
      expect(createdLogDao.settings.minDuration).to.eq(rawSetting?.settings?.minDuration)
      expect(createdLogDao.settings.minProposerVotingPower).to.eq(rawSetting?.settings?.minProposerVotingPower)
      expect(createdLogDao.settings.minApprovals).to.eq(rawSetting?.settings?.minApprovals)
      expect(createdLogDao.settings.onlyListed).to.eq(rawSetting?.settings?.onlyListed)
      expect(createdLogDao.token.name).to.eq(rawSetting?.token?.name)
      expect(createdLogDao.token.symbol).to.eq(rawSetting?.token?.symbol.toUpperCase())
      expect(createdLogDao.token.decimals).to.eq(rawSetting?.token?.decimals)
      expect(createdLogDao.token.type).to.eq(rawSetting?.token?.type)
      expect(createdLogDao.token.logo).to.eq(rawSetting?.token?.logo)
    })
  })

  it('Should getEntityId', async () => {
    const fromTxHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Setting.getEntityId({ fromTxHash, network })
    expect(entityId).to.eq(`${fromTxHash}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogPluginSetupProcessor = await Models.Setting.create(rawSetting)
    const foundLogPluginSetupProcessor = await Models.Setting.findExistingLog({
      fromTxHash: createdLogPluginSetupProcessor.fromTxHash,
      network: createdLogPluginSetupProcessor.network,
    })
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogPluginSetupProcessor = await Models.Setting.create(rawSetting)
    const foundLogPluginSetupProcessor = await Models.Setting.findByEntityId(createdLogPluginSetupProcessor.id)
    expect(foundLogPluginSetupProcessor?.id).to.eq(createdLogPluginSetupProcessor.id)
  })

  it('Should findByTransactionHash', async () => {
    const createdProposal = await Models.Setting.create(rawSetting)
    const foundProposal = await Models.Setting.findByTransactionHash(
      createdProposal.fromTxHash,
      createdProposal.network,
    )
    expect(foundProposal?.id).to.eq(createdProposal.id)
  })

  it('Should update Setting', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    expect(createdLogDao.pluginAddress).to.eq(rawSetting.pluginAddress)

    await createdLogDao.update({
      pluginAddress: '0x00',
    })

    expect(createdLogDao.pluginAddress).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Setting.create(rawSetting)
    await createdLogDao.reload()

    expect(createdLogDao.fromTxHash).to.eq(rawSetting.fromTxHash)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeSettings = [
        {
          daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
          pluginAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
          network: NetworksEnum.polygonMainnet,
          fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef8',
          fromBlockNumber: 47758873,
          settings: {
            votingMode: 1,
            supportThreshold: 500000,
            minParticipation: 150000,
            minDuration: 86400,
            minProposerVotingPower: '5e+18',
          },
        },
        {
          daoAddress: '0x6C25Eb70F88E50a3f455f4C60d36D720cC037BEE',
          pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
          network: NetworksEnum.polygonMainnet,
          fromTxHash: '0xcf464fc9ad56b1ae8544c9d31c66dfc90c45f72c12bcb389c494db7633bcaef9',
          fromBlockNumber: 47758873,
          settings: {
            minApprovals: 1,
            onlyListed: true,
          },
        },
      ]

      await Promise.all(fakeSettings.map(w => Models.Setting.create(w)))
    })

    it('Should find Pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find Pagination with onlyActive', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {
          onlyActive: true,
          network: NetworksEnum.polygonMainnet,
          pluginAddress: '0xE567419Db18d97D9cbBCA4Bb9eA566758Dc6d251',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find Pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Setting.findWithPagination({
        extraParams: {
          network: NetworksEnum.polygonMainnet,
          pluginAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1961',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should not found documents', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Setting.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(0)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
    })
  })

  it('Should filterKeys', async () => {
    const createdDao = await Models.Setting.create(rawSetting)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.id).to.exist
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(filterDao.token.address).to.exist
    expect(filterDao.settings.votingMode).to.exist
    expect(Object.keys(filterDao).length).to.eq(11)
  })
})
