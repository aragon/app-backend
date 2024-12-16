import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
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
})
