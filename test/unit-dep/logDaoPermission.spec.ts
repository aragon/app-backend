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

describe.skip('Integ: Permission Handler For linked accounts', () => {
  let sandbox: SinonSandbox
  const network = NetworksEnum.ethereumSepolia
  const parentAccount = {
    address: '0x74188b9d8CCfe236B0A20de171d79e233357154B' as HexAddress,
    blockNumber: 9639027,
  }
  const linkedAccount = {
    address: '0xc699e406aE34f755dC248507Ca3cb035FD468De6' as HexAddress,
    blockNumber: 9632588,
  }

  const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
  const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

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
      daoAddress: parentAccount.address,
      network,
      config: {
        sandbox,
      },
    })

    // ============================================
    // STEP 1: Sync both DAOs (one time only)
    // ============================================
    await libUtils.syncCompleteDao(parentAccount.blockNumber - 1)
    libUtils.daoAddress = linkedAccount.address
    sandbox.restore()

    await libUtils.syncCompleteDao(linkedAccount.blockNumber - 1)

    currentBlockNumber = (await Web3Helper.getBlockNumber(undefined, network)) - 10

    // ============================================
    // SCENARIO 1: Single permission grant does not create link
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(parentAccount.address, linkedAccount.address, parentToLinkedPermissionId),
      createGrantLogInfo(parentAccount.address, currentBlockNumber, 1, 1),
    )

    let parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    let linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts || []).to.not.include(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.be.null

    // ============================================
    // SCENARIO 2: Bidirectional grant creates link
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(linkedAccount.address, parentAccount.address, linkedToParentPermissionId),
      createGrantLogInfo(linkedAccount.address, currentBlockNumber + 1, 1, 1),
    )

    parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts).to.be.an('array').that.includes(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.equal(parentAccount.address)

    // Verify via API endpoint (using WithoutPlugins for linkedAccounts support)
    let parentApiData = await DaoController.getDaoByAddressWithoutPlugins(parentAccount.address, network)
    expect(parentApiData.address).to.be.eq(parentAccount.address)
    expect(parentApiData.linkedAccounts).to.be.an('array').with.lengthOf(1)
    expect(parentApiData.linkedAccounts![0].address).to.be.eq(linkedAccount.address)

    let childApiData = await DaoController.getDaoByAddressWithoutPlugins(linkedAccount.address, network)
    expect(childApiData.address).to.be.eq(linkedAccount.address)
    expect(childApiData.parentAccount).to.not.be.null
    expect(childApiData.parentAccount!.address).to.be.eq(parentAccount.address)

    // ============================================
    // SCENARIO 3: Parent revokes permission - unlinks DAOs
    // ============================================
    await PermissionHandler.handleRevokeOnDao(
      createParsedRevokeEvent(parentAccount.address, linkedAccount.address, parentToLinkedPermissionId),
      createRevokeLogInfo(parentAccount.address, currentBlockNumber + 2, 1, 1),
    )

    parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts || []).to.not.include(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.be.null

    // ============================================
    // SCENARIO 4: Re-grant from parent re-establishes link
    // (child's permission is still active)
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(parentAccount.address, linkedAccount.address, parentToLinkedPermissionId),
      createGrantLogInfo(parentAccount.address, currentBlockNumber + 3, 1, 1),
    )

    parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts).to.include(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.equal(parentAccount.address)

    // ============================================
    // SCENARIO 5: Child revokes permission - unlinks DAOs
    // ============================================
    await PermissionHandler.handleRevokeOnDao(
      createParsedRevokeEvent(linkedAccount.address, parentAccount.address, linkedToParentPermissionId),
      createRevokeLogInfo(linkedAccount.address, currentBlockNumber + 4, 1, 1),
    )

    parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts || []).to.not.include(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.be.null

    // ============================================
    // SCENARIO 6: Re-establish link with both grants
    // ============================================
    await PermissionHandler.handleGrantOnDao(
      createParsedGrantEvent(linkedAccount.address, parentAccount.address, linkedToParentPermissionId),
      createGrantLogInfo(linkedAccount.address, currentBlockNumber + 5, 1, 1),
    )

    parentAccountDb = await Models.Dao.findByAddress(parentAccount.address, network)
    linkedAccountDb = await Models.Dao.findByAddress(linkedAccount.address, network)

    expect(parentAccountDb.linkedAccounts).to.include(linkedAccount.address)
    expect(linkedAccountDb.parentAccount).to.equal(parentAccount.address)

    // Final API verification (using WithoutPlugins for linkedAccounts support)
    parentApiData = await DaoController.getDaoByAddressWithoutPlugins(parentAccount.address, network)
    expect(parentApiData.linkedAccounts).to.be.an('array').with.lengthOf(1)
    expect(parentApiData.linkedAccounts![0].address).to.be.eq(linkedAccount.address)

    childApiData = await DaoController.getDaoByAddressWithoutPlugins(linkedAccount.address, network)
    expect(childApiData.parentAccount).to.not.be.null
    expect(childApiData.parentAccount!.address).to.be.eq(parentAccount.address)
  })
})
