import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { type HexAddress, NetworksEnum } from '@types'
import { LibUtils } from '@test/lib/unit-dep/lib'
import Web3Helper from '@helpers/web3'
import { PermissionHandler } from '@handlers/permissionHandler'
import { Models } from '@dbModels'
import { expect } from 'chai'
import DaoController from '@api/controllers/dao'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'

describe.only('Integ: Permission Handler For Sub Daos', () => {
  let sandbox: SinonSandbox
  const network = NetworksEnum.ethereumSepolia
  const parentDao = {
    address: '0x74188b9d8CCfe236B0A20de171d79e233357154B' as HexAddress,
    blockNumber: 9639027,
  }
  const childDao = {
    address: '0xc699e406aE34f755dC248507Ca3cb035FD468De6' as HexAddress,
    blockNumber: 9632588,
  }

  const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
  const subToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

  let libUtils: LibUtils
  let currentBlockNumber: number

  /**
   * Helper to create grant permission log info
   */
  const createGrantLogInfo = (
    daoAddress: HexAddress,
    blockNumber: number,
    transactionIndex: number,
    logIndex: number,
  ) => ({
    network,
    transactionIndex,
    logIndex,
    transactionHash: `0xGrantTxHash${blockNumber}${transactionIndex}${logIndex}`,
    address: daoAddress,
    eventName: 'Granted',
    blockNumber,
  })

  /**
   * Helper to create revoke permission log info
   */
  const createRevokeLogInfo = (
    daoAddress: HexAddress,
    blockNumber: number,
    transactionIndex: number,
    logIndex: number,
  ) => ({
    network,
    transactionIndex,
    logIndex,
    transactionHash: `0xRevokeTxHash${blockNumber}${transactionIndex}${logIndex}`,
    address: daoAddress,
    eventName: 'Revoked',
    blockNumber,
  })

  /**
   * Helper to create parsed grant event
   */
  const createParsedGrantEvent = (where: HexAddress, who: HexAddress, permissionId: string) =>
    ({
      args: {
        where,
        who,
        permissionId,
        condition: '0x0000000000000000000000000000000000000000',
      },
    }) as any

  /**
   * Helper to create parsed revoke event
   */
  const createParsedRevokeEvent = (where: HexAddress, who: HexAddress, permissionId: string) =>
    ({
      args: {
        where,
        who,
        permissionId,
        condition: '0x0000000000000000000000000000000000000000',
      },
    }) as any

  it('test DAO linking and unlinking via permission grants and revokes', async function () {
    this.timeout(1000000000)

    sandbox = sinon.createSandbox()
    libUtils = new LibUtils({
      daoAddress: parentDao.address,
      network,
      config: {
        sandbox,
      },
    })

    // ============================================
    // STEP 1: Sync both DAOs (one time only)
    // ============================================
    await libUtils.syncCompleteDao(parentDao.blockNumber - 1)
    libUtils.daoAddress = childDao.address
    sandbox.restore()

    await libUtils.syncCompleteDao(childDao.blockNumber - 1)

    currentBlockNumber = (await Web3Helper.getBlockNumber(undefined, network)) - 10

    // ============================================
    // SCENARIO 1: Single permission grant does not create link
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(parentDao.address, childDao.address, parentToSubPermissionId),
      createGrantLogInfo(parentDao.address, currentBlockNumber, 1, 1),
    )

    let parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    let childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos || []).to.not.include(childDao.address)
    expect(childDaoDb.parentDao).to.be.null

    // ============================================
    // SCENARIO 2: Bidirectional grant creates link
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(childDao.address, parentDao.address, subToParentPermissionId),
      createGrantLogInfo(childDao.address, currentBlockNumber + 1, 1, 1),
    )

    parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos).to.be.an('array').that.includes(childDao.address)
    expect(childDaoDb.parentDao).to.equal(parentDao.address)

    // Verify via API endpoint (using WithoutPlugins for subDaos support)
    let parentApiData = await DaoController.getDaoByAddressWithoutPlugins(parentDao.address, network)
    expect(parentApiData.address).to.be.eq(parentDao.address)
    expect(parentApiData.subDaos).to.be.an('array').with.lengthOf(1)
    expect(parentApiData.subDaos![0].address).to.be.eq(childDao.address)

    let childApiData = await DaoController.getDaoByAddressWithoutPlugins(childDao.address, network)
    expect(childApiData.address).to.be.eq(childDao.address)
    expect(childApiData.parentDao).to.not.be.null
    expect(childApiData.parentDao!.address).to.be.eq(parentDao.address)

    // ============================================
    // SCENARIO 3: Parent revokes permission - unlinks DAOs
    // ============================================
    await PermissionHandler.handleRevokeOnDao(
      createParsedRevokeEvent(parentDao.address, childDao.address, parentToSubPermissionId),
      createRevokeLogInfo(parentDao.address, currentBlockNumber + 2, 1, 1),
    )

    parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos || []).to.not.include(childDao.address)
    expect(childDaoDb.parentDao).to.be.null

    // ============================================
    // SCENARIO 4: Re-grant from parent re-establishes link
    // (child's permission is still active)
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(parentDao.address, childDao.address, parentToSubPermissionId),
      createGrantLogInfo(parentDao.address, currentBlockNumber + 3, 1, 1),
    )

    parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos).to.include(childDao.address)
    expect(childDaoDb.parentDao).to.equal(parentDao.address)

    // ============================================
    // SCENARIO 5: Child revokes permission - unlinks DAOs
    // ============================================
    await PermissionHandler.handleRevokeOnDao(
      createParsedRevokeEvent(childDao.address, parentDao.address, subToParentPermissionId),
      createRevokeLogInfo(childDao.address, currentBlockNumber + 4, 1, 1),
    )

    parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos || []).to.not.include(childDao.address)
    expect(childDaoDb.parentDao).to.be.null

    // ============================================
    // SCENARIO 6: Re-establish link with both grants
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(childDao.address, parentDao.address, subToParentPermissionId),
      createGrantLogInfo(childDao.address, currentBlockNumber + 5, 1, 1),
    )

    parentDaoDb = await Models.Dao.findByAddress(parentDao.address, network)
    childDaoDb = await Models.Dao.findByAddress(childDao.address, network)

    expect(parentDaoDb.subDaos).to.include(childDao.address)
    expect(childDaoDb.parentDao).to.equal(parentDao.address)

    // Final API verification (using WithoutPlugins for subDaos support)
    parentApiData = await DaoController.getDaoByAddressWithoutPlugins(parentDao.address, network)
    expect(parentApiData.subDaos).to.be.an('array').with.lengthOf(1)
    expect(parentApiData.subDaos![0].address).to.be.eq(childDao.address)

    childApiData = await DaoController.getDaoByAddressWithoutPlugins(childDao.address, network)
    expect(childApiData.parentDao).to.not.be.null
    expect(childApiData.parentDao!.address).to.be.eq(parentDao.address)
  })
})
