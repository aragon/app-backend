import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { NetworksEnum } from '@types'

describe('Dao Permission', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('create dao permission', () => {
    it('should create a new dao permission', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      const daoPermission = await Models.DaoPermission.create({
        ...mockDaoPermission,
      })

      expect(daoPermission.permissionId).to.be.equal(mockDaoPermission.permissionId)
      expect(daoPermission.whoAddress).to.be.equal(mockDaoPermission.whoAddress)
      expect(daoPermission.whereAddress).to.be.equal(mockDaoPermission.whereAddress)
      expect(daoPermission.event).to.be.equal(mockDaoPermission.event)
      expect(daoPermission.blockNumber).to.be.equal(mockDaoPermission.blockNumber)
      expect(daoPermission.transactionHash).to.be.equal(mockDaoPermission.transactionHash)
      expect(daoPermission.transactionIndex).to.be.equal(mockDaoPermission.transactionIndex)
      expect(daoPermission.logIndex).to.be.equal(mockDaoPermission.logIndex)
      expect(daoPermission.daoAddress).to.be.equal(mockDaoPermission.daoAddress)
    })

    it('should not create a new dao permission if network is missing', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      await expect(
        Models.DaoPermission.create({
          ...mockDaoPermission,
          network: undefined,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should not create a new dao permission if transactionHash is missing', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      await expect(
        Models.DaoPermission.create({
          ...mockDaoPermission,
          transactionHash: undefined,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should not create a new dao permission if transactionIndex is missing', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      await expect(
        Models.DaoPermission.create({
          ...mockDaoPermission,
          transactionIndex: undefined,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('should not create a new dao permission if logIndex is missing', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      await expect(
        Models.DaoPermission.create({
          ...mockDaoPermission,
          logIndex: undefined,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })

    it('should not create a new dao permission if daoAddress is missing', async () => {
      const mockDaoPermission = FakeDaoPermissions[0]

      await expect(
        Models.DaoPermission.create({
          ...mockDaoPermission,
          daoAddress: undefined,
        }),
      ).to.be.rejectedWith('daoAddress is required')
    })
  })

  it('should get entity id', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]
    const entityId = Models.DaoPermission.getEntityId({
      network: mockDaoPermission.network,
      transactionHash: mockDaoPermission.transactionHash,
      transactionIndex: mockDaoPermission.transactionIndex,
      logIndex: mockDaoPermission.logIndex,
      daoAddress: mockDaoPermission.daoAddress,
    })

    expect(entityId).to.be.equal(
      `${mockDaoPermission.network}-${mockDaoPermission.transactionHash}-${mockDaoPermission.transactionIndex}-${mockDaoPermission.logIndex}-${mockDaoPermission.daoAddress}`,
    )
  })

  it('should find existing log', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]

    const savedDBItem = await Models.DaoPermission.create({
      ...mockDaoPermission,
    })

    const existingLog = await Models.DaoPermission.findExistingLog({
      network: mockDaoPermission.network,
      transactionHash: mockDaoPermission.transactionHash,
      transactionIndex: mockDaoPermission.transactionIndex,
      logIndex: mockDaoPermission.logIndex,
      daoAddress: mockDaoPermission.daoAddress,
    })

    expect(existingLog).to.be.an('object')
    expect(existingLog?.id).to.be.equal(savedDBItem.id)
    expect(existingLog?.permissionId).to.be.equal(mockDaoPermission.permissionId)
    expect(existingLog?.whoAddress).to.be.equal(mockDaoPermission.whoAddress)
    expect(existingLog?.whereAddress).to.be.equal(mockDaoPermission.whereAddress)
    expect(existingLog?.event).to.be.equal(mockDaoPermission.event)
    expect(existingLog?.blockNumber).to.be.equal(mockDaoPermission.blockNumber)
    expect(existingLog?.transactionHash).to.be.equal(mockDaoPermission.transactionHash)
    expect(existingLog?.transactionIndex).to.be.equal(mockDaoPermission.transactionIndex)
    expect(existingLog?.logIndex).to.be.equal(mockDaoPermission.logIndex)
    expect(existingLog?.daoAddress).to.be.equal(mockDaoPermission.daoAddress)
  })

  it('should find by entity id', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]

    await Models.DaoPermission.create({
      ...mockDaoPermission,
    })

    const existingLog = await Models.DaoPermission.findByEntityId(
      `${mockDaoPermission.network}-${mockDaoPermission.transactionHash}-${mockDaoPermission.transactionIndex}-${mockDaoPermission.logIndex}-${mockDaoPermission.daoAddress}`,
    )

    expect(existingLog).to.be.an('object')
    expect(existingLog?.permissionId).to.be.equal(mockDaoPermission.permissionId)
    expect(existingLog?.whoAddress).to.be.equal(mockDaoPermission.whoAddress)
    expect(existingLog?.whereAddress).to.be.equal(mockDaoPermission.whereAddress)
    expect(existingLog?.event).to.be.equal(mockDaoPermission.event)
    expect(existingLog?.blockNumber).to.be.equal(mockDaoPermission.blockNumber)
    expect(existingLog?.transactionHash).to.be.equal(mockDaoPermission.transactionHash)
    expect(existingLog?.transactionIndex).to.be.equal(mockDaoPermission.transactionIndex)
    expect(existingLog?.logIndex).to.be.equal(mockDaoPermission.logIndex)
    expect(existingLog?.daoAddress).to.be.equal(mockDaoPermission.daoAddress)
  })

  it('should find permission', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]

    await Models.DaoPermission.create({
      ...mockDaoPermission,
    })

    const permissions = await Models.DaoPermission.findPermission(
      mockDaoPermission.daoAddress,
      mockDaoPermission.network,
      mockDaoPermission.permissionId,
    )

    expect(permissions).to.be.an('array')
    expect(permissions).to.have.lengthOf(1)
    expect(permissions[0].permissionId).to.be.equal(mockDaoPermission.permissionId)
    expect(permissions[0].whoAddress).to.be.equal(mockDaoPermission.whoAddress)
    expect(permissions[0].whereAddress).to.be.equal(mockDaoPermission.whereAddress)
    expect(permissions[0].event).to.be.equal(mockDaoPermission.event)
    expect(permissions[0].blockNumber).to.be.equal(mockDaoPermission.blockNumber)
    expect(permissions[0].transactionHash).to.be.equal(mockDaoPermission.transactionHash)
    expect(permissions[0].transactionIndex).to.be.equal(mockDaoPermission.transactionIndex)
    expect(permissions[0].logIndex).to.be.equal(mockDaoPermission.logIndex)
    expect(permissions[0].daoAddress).to.be.equal(mockDaoPermission.daoAddress)
  })

  it('should find permission with no permission', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]

    await Models.DaoPermission.create({
      ...mockDaoPermission,
    })

    const permissions = await Models.DaoPermission.findPermission(
      mockDaoPermission.daoAddress,
      mockDaoPermission.network,
      '0xxx',
    )

    expect(permissions).to.be.an('array')
    expect(permissions).to.have.lengthOf(0)
  })

  it('should update permission', async () => {
    const mockDaoPermission = FakeDaoPermissions[0]

    await Models.DaoPermission.create({
      ...mockDaoPermission,
    })

    const existingLog = await Models.DaoPermission.findExistingLog({
      network: mockDaoPermission.network,
      transactionHash: mockDaoPermission.transactionHash,
      transactionIndex: mockDaoPermission.transactionIndex,
      logIndex: mockDaoPermission.logIndex,
      daoAddress: mockDaoPermission.daoAddress,
    })

    await existingLog?.update({
      permissionId: '0x1234',
    })

    const updatedLog = await existingLog.reload()

    expect(updatedLog.permissionId).to.be.equal('0x1234')
  })

  describe('findWithPagination', () => {
    it('should return only active granted permissions', async () => {
      const daoAddress = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'
      const network = NetworksEnum.ethereumSepolia

      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM1',
        whoAddress: '0xWHO1',
        whereAddress: '0xWHERE1',
        event: 'Granted',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 200,
        transactionHash: '0x02',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM1',
        whoAddress: '0xWHO1',
        whereAddress: '0xWHERE1',
        event: 'Revoked',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 150,
        transactionHash: '0x03',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM2',
        whoAddress: '0xWHO2',
        whereAddress: '0xWHERE2',
        event: 'Granted',
      })

      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].permissionId).to.equal('0xPERM2')
      expect(result.data[0].whoAddress).to.equal('0xWHO2')
      expect(result.data[0].whereAddress).to.equal('0xWHERE2')
      expect(result.metadata.totalRecords).to.equal(1)
    })

    it('should handle pagination correctly', async () => {
      const daoAddress = '0xDAO123'
      const network = NetworksEnum.ethereumSepolia

      for (let i = 0; i < 25; i++) {
        await Models.DaoPermission.create({
          network,
          blockNumber: 100 + i,
          transactionHash: `0x${i.toString().padStart(64, '0')}`,
          transactionIndex: 0,
          logIndex: i,
          daoAddress,
          permissionId: `0xPERM${i}`,
          whoAddress: `0xWHO${i}`,
          whereAddress: `0xWHERE${i}`,
          event: 'Granted',
        })
      }

      const page1 = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })

      expect(page1.data).to.have.lengthOf(10)
      expect(page1.metadata.totalRecords).to.equal(25)
      expect(page1.metadata.totalPages).to.equal(3)
      expect(page1.metadata.page).to.equal(1)

      const page2 = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 2 },
      })

      expect(page2.data).to.have.lengthOf(10)
      expect(page2.metadata.page).to.equal(2)
      expect(page2.metadata.totalRecords).to.equal(25)

      const page3 = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 3 },
      })

      expect(page3.data).to.have.lengthOf(5)
      expect(page3.metadata.page).to.equal(3)
      expect(page3.metadata.totalRecords).to.equal(25)
    })

    it('should return latest event per permission group', async () => {
      const daoAddress = '0xDAO456'
      const network = NetworksEnum.ethereumSepolia

      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM1',
        whoAddress: '0xWHO1',
        whereAddress: '0xWHERE1',
        event: 'Granted',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 150,
        transactionHash: '0x02',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM1',
        whoAddress: '0xWHO1',
        whereAddress: '0xWHERE1',
        event: 'Revoked',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 200,
        transactionHash: '0x03',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId: '0xPERM1',
        whoAddress: '0xWHO1',
        whereAddress: '0xWHERE1',
        event: 'Granted',
      })

      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].permissionId).to.equal('0xPERM1')
      expect(result.data[0].blockNumber).to.equal(200)
      expect(result.metadata.totalRecords).to.equal(1)
    })
  })
})
