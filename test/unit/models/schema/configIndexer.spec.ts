import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IEnumIndexerService, IndexerType, IPluginInterfaceType, ITransactionType, NetworksEnum } from '@types'
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
    const service = `dao-${NetworksEnum.chilizMainnet}-0x1234567890abcdef1234567890abcdef12345678`
    const createdConfigIndexer = await Models.ConfigIndexer.create({ ...rawConfigIndexer, service })

    const params = createdConfigIndexer.extractInfoFromServiceName()

    expect(params.indexerType).to.be.eq(IndexerType.dao)
    expect(params.network).to.be.eq(NetworksEnum.chilizMainnet)
    expect(params.daoAddress).to.be.eq('0x1234567890abcdef1234567890abcdef12345678')
  })

  it('should dismantle plugin service and network from id', async () => {
    const service = `${IPluginInterfaceType.tokenVoting}-${NetworksEnum.ethereumMainnet}-0x1234567890abcdef1234567890abcdef12345678`
    const createdConfigIndexer = await Models.ConfigIndexer.create({ ...rawConfigIndexer, service })

    const params = createdConfigIndexer.extractInfoFromServiceName()

    expect(params.indexerType).to.be.eq(IndexerType.plugin)
    expect(params.network).to.be.eq(NetworksEnum.ethereumMainnet)
    expect(params.interfaceType).to.be.eq(IPluginInterfaceType.tokenVoting)
    expect(params.pluginAddress).to.be.eq('0x1234567890abcdef1234567890abcdef12345678')
  })

  it('should return null if service name does not match expected format', async () => {
    const service = 'invalid-servicename-0x1234567890abcdef1234567890abcdef12345678'

    const createdConfigIndexer = await Models.ConfigIndexer.create({ ...rawConfigIndexer, service })

    const params = createdConfigIndexer.extractInfoFromServiceName()
    expect(params).to.be.null
  })

  describe('extractInfoFromServiceName', () => {
    it('should extract info from indexer pattern: indexer-{network}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumSepolia,
        service: 'indexer-ethereum-sepolia',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.indexer)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumSepolia)
    })

    it('should extract info from tokenTransfers pattern: transferList-{address}-{network}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.cornMainnet,
        service: 'transferList-0xca2BAF878f49FF8769E527Dea4FEFB58220A9577-corn-mainnet',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.tokenTransfers)
      expect(extractedInfo?.tokenAddress).to.eq('0xca2BAF878f49FF8769E527Dea4FEFB58220A9577')
      expect(extractedInfo?.network).to.eq(NetworksEnum.cornMainnet)
    })

    it('should extract info from daoTransactions pattern (deposit): {transactionType}-{daoAddress}-{indexerService}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: 'deposit-0x5d1cA35ff34D39406BC2Ee9d84c9e831a844Dc42-depositTxs',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.daoTransactions)
      expect(extractedInfo?.transactionType).to.eq(ITransactionType.deposit)
      expect(extractedInfo?.daoAddress).to.eq('0x5d1cA35ff34D39406BC2Ee9d84c9e831a844Dc42')
      expect(extractedInfo?.indexerService).to.eq(IEnumIndexerService.depositTxs)
    })

    it('should extract info from daoTransactions pattern (withdraw): {transactionType}-{daoAddress}-{indexerService}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.polygonMainnet,
        service: 'withdraw-0x240f954151FD0FE40E59dECfa6668f1cBb51D9F3-withdrawTxs',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.daoTransactions)
      expect(extractedInfo?.transactionType).to.eq(ITransactionType.withdraw)
      expect(extractedInfo?.daoAddress).to.eq('0x240f954151FD0FE40E59dECfa6668f1cBb51D9F3')
      expect(extractedInfo?.indexerService).to.eq(IEnumIndexerService.withdrawTxs)
    })

    it('should extract info from dao pattern: dao-{network}-{daoAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.polygonMainnet,
        service: 'dao-polygon-mainnet-0xff8564E809a556D48675aE7530eB5A4e0Ab297ae',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.dao)
      expect(extractedInfo?.network).to.eq(NetworksEnum.polygonMainnet)
      expect(extractedInfo?.daoAddress).to.eq('0xff8564E809a556D48675aE7530eB5A4e0Ab297ae')
    })

    it('should extract info from plugin pattern (tokenVoting): {pluginType}-{network}-{pluginAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: 'tokenVoting-ethereum-mainnet-0x1Ad48A1405fF5E6cfb43b6dac7E3E482088d7d85',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.plugin)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(extractedInfo?.pluginAddress).to.eq('0x1Ad48A1405fF5E6cfb43b6dac7E3E482088d7d85')
    })

    it('should extract info from plugin pattern (multisig): {pluginType}-{network}-{pluginAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: 'multisig-ethereum-mainnet-0x2ceC777A49333ca7F0b92419D22351aCD09f0d82',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.plugin)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.multisig)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(extractedInfo?.pluginAddress).to.eq('0x2ceC777A49333ca7F0b92419D22351aCD09f0d82')
    })

    it('should extract info from plugin pattern (admin): {pluginType}-{network}-{pluginAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumSepolia,
        service: 'admin-ethereum-sepolia-0xEAFdb63CEb5909b8acCD39DCC8af78c00777a69d',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.plugin)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.admin)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumSepolia)
      expect(extractedInfo?.pluginAddress).to.eq('0xEAFdb63CEb5909b8acCD39DCC8af78c00777a69d')
    })

    it('should extract info from plugin pattern (spp): {pluginType}-{network}-{pluginAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumSepolia,
        service: 'spp-ethereum-sepolia-0x2bE17F788E651f65B4f02dE2E79116662F33aEC6',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.plugin)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.spp)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumSepolia)
      expect(extractedInfo?.pluginAddress).to.eq('0x2bE17F788E651f65B4f02dE2E79116662F33aEC6')
    })

    it('should extract info from token pattern (tokenVoting with token): {pluginType}-{network}-{pluginAddress}-{tokenAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.polygonMainnet,
        service:
          'tokenVoting-polygon-mainnet-0x703Bf30B62239216E22307a526c4eB148Fddeed7-0xff602165c513E1B73eB644525497521873e923AD',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.token)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.tokenVoting)
      expect(extractedInfo?.network).to.eq(NetworksEnum.polygonMainnet)
      expect(extractedInfo?.pluginAddress).to.eq('0x703Bf30B62239216E22307a526c4eB148Fddeed7')
      expect(extractedInfo?.tokenAddress).to.eq('0xff602165c513E1B73eB644525497521873e923AD')
    })

    it('should extract info from token pattern (gauge with token): {pluginType}-{network}-{pluginAddress}-{tokenAddress}', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service:
          'gauge-ethereum-mainnet-0x69E8D5151d71d4cde35b5076aF3023C7D54d379E-0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.not.be.null
      expect(extractedInfo?.indexerType).to.eq(IndexerType.token)
      expect(extractedInfo?.interfaceType).to.eq(IPluginInterfaceType.gauge)
      expect(extractedInfo?.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(extractedInfo?.pluginAddress).to.eq('0x69E8D5151d71d4cde35b5076aF3023C7D54d379E')
      expect(extractedInfo?.tokenAddress).to.eq('0x1b6ec227ceBeC25118270efbb4b67642fc29965E')
    })

    it('should return null for invalid service name pattern', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: 'invalid-servicename-0x1234567890abcdef1234567890abcdef12345678',
        lastSync: 0,
      }

      const configIndexer = await Models.ConfigIndexer.create(rawConfigIndexer)
      const extractedInfo = configIndexer.extractInfoFromServiceName()

      expect(extractedInfo).to.be.null
    })
  })
})
