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
      links: [
        { name: 'Website', url: 'https://example.com' },
        { name: 'Docs', url: 'https://docs.example.com' },
      ],
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
    const entityId = Models.Gauge.getEntityId({ address, network, pluginAddress: rawGauge.pluginAddress })
    expect(entityId).to.eq(`${network}-${address}-${rawGauge.pluginAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const foundGauge = await Models.Gauge.findExistingLog({
      address: createdGauge.address,
      network: createdGauge.network,
      pluginAddress: createdGauge.pluginAddress,
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
      links: [{ name: 'Updated Link', url: 'https://updated.com' }],
      avatar: 'https://updated.com/avatar.png',
    })

    expect(createdGauge.name).to.eq('Updated Gauge Name')
    expect(createdGauge.isActive).to.eq(true)
    expect(createdGauge.links).to.deep.eq([{ name: 'Updated Link', url: 'https://updated.com' }])
    expect(createdGauge.avatar).to.eq('https://updated.com/avatar.png')
  })

  it('Should not update required field with falsy value', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const originalAddress = createdGauge.address

    // Try to update required field with null - should not update
    await createdGauge.update({
      address: null as any,
    })

    expect(createdGauge.address).to.eq(originalAddress)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)

    // Try to update with non-existent field
    await createdGauge.update({
      nonExistentField: 'some value',
    } as any)

    // Should not throw error, just skip the field
    expect(createdGauge).to.exist
  })

  it('Should not update when value is same as current', async () => {
    const createdGauge = await Models.Gauge.create(rawGauge)
    const originalName = createdGauge.name

    // Update with same value
    await createdGauge.update({
      name: originalName,
    })

    expect(createdGauge.name).to.eq(originalName)
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
          isActive: true,
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
          isActive: true,
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
          isActive: true,
        },
      ]

      await Promise.all(fakeGauges.map(g => Models.Gauge.create(g)))
    })

    it('Should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        params: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)

      // Verify response structure
      data.forEach((gauge: any) => {
        expect(gauge).to.have.property('network')
        expect(gauge).to.have.property('blockNumber')
        expect(gauge).to.have.property('transactionHash')
        expect(gauge).to.have.property('address')
        expect(gauge).to.have.property('pluginAddress')
        expect(gauge).to.have.property('creatorAddress')
        expect(gauge).to.have.property('name')
        expect(gauge).to.have.property('description')
        expect(gauge).to.have.property('isActive')
        expect(gauge).to.have.property('metrics')
        expect(gauge.metrics).to.have.property('totalMemberVoteCount')
        expect(gauge.metrics).to.have.property('currentEpochVotingPower')
        expect(gauge.metrics).to.have.property('totalGaugeVotingPower')
        expect(gauge.metrics).to.have.property('epochId')
      })
    })

    it('Should find pagination with network filter', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        params: {
          network: NetworksEnum.ethereumMainnet,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)

      // Verify all returned gauges have the correct network
      data.forEach((gauge: any) => {
        expect(gauge.network).to.eq(NetworksEnum.ethereumMainnet)
      })
    })

    it('Should find pagination with pluginAddress filter', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        params: {
          pluginAddress: '0xPluginAddress11111111111111111111111',
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)

      // Verify the returned gauge has correct pluginAddress
      expect(data[0].pluginAddress).to.eq('0xPluginAddress11111111111111111111111')
    })

    it('Should find pagination with combined filters', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Gauge.findWithPagination({
        params: {
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

      // Verify combined filters
      expect(data[0].network).to.eq(NetworksEnum.ethereumMainnet)
      expect(data[0].pluginAddress).to.eq('0xPluginAddress11111111111111111111111')
    })

    it('Should find pagination with epochId - default metrics when no GaugeMetrics exists', async () => {
      const epochId = '5'
      const {
        data,
        metadata: { totalRecords },
      } = await Models.Gauge.findWithPagination({
        params: {
          epochId,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)

      // Verify all gauges have default metrics with the provided epochId
      data.forEach((gauge: any) => {
        expect(gauge.metrics).to.deep.equal({
          totalMemberVoteCount: 0,
          currentEpochVotingPower: '0',
          totalGaugeVotingPower: '0',
          epochId,
        })
      })
    })

    it('Should find pagination with epochId and other filters', async () => {
      const epochId = '10'
      const { data } = await Models.Gauge.findWithPagination({
        params: {
          network: NetworksEnum.ethereumMainnet,
          epochId,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)

      // Verify metrics structure with epochId
      data.forEach((gauge: any) => {
        expect(gauge.network).to.eq(NetworksEnum.ethereumMainnet)
        expect(gauge.metrics.epochId).to.eq(epochId)
        expect(gauge.metrics.totalMemberVoteCount).to.eq(0)
        expect(gauge.metrics.currentEpochVotingPower).to.eq('0')
        expect(gauge.metrics.totalGaugeVotingPower).to.eq('0')
      })
    })

    it('Should not found documents when page exceeds total', async () => {
      const opts = {
        page: 7,
        pageSize: 2,
      }

      const result = await Models.Gauge.findWithPagination({
        params: {},
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
        params: {},
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
        params: {},
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

    it('Should only return active gauges', async () => {
      // Create an inactive gauge
      await Models.Gauge.create({
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 999,
        transactionHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
        address: '0xInactiveGauge99999999999999999999999',
        pluginAddress: '0xPluginAddress99999999999999999999999',
        creatorAddress: '0xCreatorAddress9999999999999999999999',
        name: 'Inactive Gauge',
        description: 'This gauge is inactive',
        isActive: false,
      })

      const { data, metadata } = await Models.Gauge.findWithPagination({
        params: {},
        paginationParams: {},
      })

      // Should still only return 3 active gauges, not 4
      expect(data.length).to.eq(3)
      expect(metadata.totalRecords).to.eq(3)

      // Verify all returned gauges are active
      data.forEach((gauge: any) => {
        expect(gauge.isActive).to.be.true
      })
    })
  })
})
