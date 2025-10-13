import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, IPluginInterfaceType, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import Gauge from '@models/schema/gauge'

describe('Model: Gauge', () => {
  let sandbox: SinonSandbox
  let rawGauge: Partial<Gauge>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawGauge = {
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345678,
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      address: '0x1111111111111111111111111111111111111111',
      pluginAddress: '0x2222222222222222222222222222222222222222',
      creatorAddress: '0x3333333333333333333333333333333333333333',
      name: 'Test Gauge',
      description: 'Test gauge description',
      links: ['https://example.com', 'https://docs.example.com'],
      avatar: 'https://example.com/avatar.png',
      isActive: false,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Gauge', () => {
    it('Should create Gauge', async () => {
      const createdGauge = await Models.Gauge.create(rawGauge)

      expect(createdGauge.id).to.exist
      expect(createdGauge.network).to.eq(rawGauge.network)
      expect(createdGauge.blockNumber).to.eq(rawGauge.blockNumber)
      expect(createdGauge.transactionHash).to.eq(rawGauge.transactionHash)
      expect(createdGauge.address).to.eq(rawGauge.address)
      expect(createdGauge.pluginAddress).to.eq(rawGauge.pluginAddress)
      expect(createdGauge.creatorAddress).to.eq(rawGauge.creatorAddress)
      expect(createdGauge.name).to.eq(rawGauge.name)
      expect(createdGauge.description).to.eq(rawGauge.description)
      expect(createdGauge.links).to.deep.eq(rawGauge.links)
      expect(createdGauge.avatar).to.eq(rawGauge.avatar)
      expect(createdGauge.isActive).to.eq(rawGauge.isActive)
    })

    it('Should create Gauge with id already present', async () => {
      const entityId = Models.Gauge.getEntityId({
        network: rawGauge.network!,
        address: rawGauge.address!,
      })

      rawGauge.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.Gauge, 'getEntityId')
      const createdGauge = await Models.Gauge.create(rawGauge)

      expect(getEntityIdSpy.called).to.be.false
      expect(createdGauge.id).to.eq(entityId)
    })

    it('Should fail when network is not present', async () => {
      await expect(
        Models.Gauge.create({
          address: rawGauge.address,
          transactionHash: rawGauge.transactionHash,
          pluginAddress: rawGauge.pluginAddress,
          creatorAddress: rawGauge.creatorAddress,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('Should fail when address is not present', async () => {
      await expect(
        Models.Gauge.create({
          network: rawGauge.network,
          transactionHash: rawGauge.transactionHash,
          pluginAddress: rawGauge.pluginAddress,
          creatorAddress: rawGauge.creatorAddress,
        }),
      ).to.be.rejectedWith('address is required')
    })
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Gauge.getEntityId({ address, network })
    expect(entityId).to.eq(`${network}-${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const foundGauge = await Models.Gauge.findExistingLog({
      address: createdGauge.address,
      network: createdGauge.network,
    })
    expect(foundGauge?.id).to.eq(createdGauge.id)
  })

  it('Should findByEntityId', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const foundGauge = await Models.Gauge.findByEntityId(createdGauge.id)
    expect(foundGauge?.id).to.eq(createdGauge.id)
  })

  it('Should update Gauge', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    expect(createdGauge.name).to.eq(rawGauge.name)
    expect(createdGauge.isActive).to.eq(false)

    await createdGauge.update({
      name: 'Updated Gauge Name',
      isActive: true,
      links: ['https://updated.com'],
      avatar: 'https://updated.com/avatar.png',
    })

    expect(createdGauge.name).to.eq('Updated Gauge Name')
    expect(createdGauge.isActive).to.eq(true)
    expect(createdGauge.links).to.deep.eq(['https://updated.com'])
    expect(createdGauge.avatar).to.eq('https://updated.com/avatar.png')
  })

  it('Should reload', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const reloadedGauge = await createdGauge.reload()

    expect(reloadedGauge.address).to.eq(rawGauge.address)
    expect(reloadedGauge.network).to.eq(rawGauge.network)
  })

  it('Should getPlugin', async () => {
    // Create a plugin first
    const plugin = await Models.Plugin.create({
      address: rawGauge.pluginAddress,
      daoAddress: '0x4444444444444444444444444444444444444444',
      network: rawGauge.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      status: IPluginStatus.installed,
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      blockNumber: 12345600,
    })

    const createdGauge = await Models.Gauge.create(rawGauge)
    const foundPlugin = await createdGauge.getPlugin()

    expect(foundPlugin).to.exist
    expect(foundPlugin?.address).to.eq(plugin.address)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const fakeGauges = [
        {
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 12345678,
          transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          address: '0xGauge1Address111111111111111111111111',
          pluginAddress: '0xPluginAddress11111111111111111111111',
          creatorAddress: '0xCreatorAddress1111111111111111111111',
          name: 'Gauge 1',
          description: 'First test gauge',
        },
        {
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 12345679,
          transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
          address: '0xGauge2Address222222222222222222222222',
          pluginAddress: '0xPluginAddress22222222222222222222222',
          creatorAddress: '0xCreatorAddress2222222222222222222222',
          name: 'Gauge 2',
          description: 'Second test gauge',
        },
        {
          network: NetworksEnum.polygonMainnet,
          blockNumber: 12345680,
          transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
          address: '0xGauge3Address333333333333333333333333',
          pluginAddress: '0xPluginAddress33333333333333333333333',
          creatorAddress: '0xCreatorAddress3333333333333333333333',
          name: 'Gauge 3',
          description: 'Third test gauge',
        },
      ]

      await Promise.all(fakeGauges.map(g => Models.Gauge.create(g)))
    })

    it('Should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find pagination with network filter', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {
          network: NetworksEnum.ethereumMainnet,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find pagination with pluginAddress filter', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {
          pluginAddress: '0xPluginAddress11111111111111111111111',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should find pagination with combined filters', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0xPluginAddress11111111111111111111111',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('Should not found documents when page exceeds total', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Gauge.findWithPagination({
        extraParams: {},
        paginationParams: opts,
      })

      expect(result.data.length).to.eq(0)
      expect(result.metadata.totalRecords).to.eq(0)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.totalPages).to.eq(1)
    })

    it('Should paginate with custom page size', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {},
        paginationParams: {
          page: 1,
          pageSize: 2,
        },
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(2)
      expect(pageSize).to.eq(2)
    })

    it('Should get second page', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        extraParams: {},
        paginationParams: {
          page: 2,
          pageSize: 2,
        },
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(2)
      expect(totalPages).to.eq(2)
      expect(pageSize).to.eq(2)
    })
  })
})
