import { Models } from '@dbModels'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import {
  IConditionInterfaceType,
  IPermissionResponse,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

      const keys = [...page1.data, ...page2.data, ...page3.data].map(
        (row: any) => `${row.permissionId}-${row.whoAddress}-${row.whereAddress}`,
      )
      expect(new Set(keys).size).to.equal(25)
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

  describe('findWithPagination condition enrichment', () => {
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'

    const votingCondition = '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB'
    const multisigCondition = '0x902D99e5291ba7628AeD2b03dc533E4BBcAAA5aE'
    const selectorCondition = '0x23c4aDb7CE681a785ACbf75841b0312A7014BB98'
    const emptySelectorCondition = '0x9A6EbE7E2a7722F8200d0ffB63a1F6406A0d7dce'
    const verifiedEmptyCondition = '0x3BCE21a6EFeF775960D121D3A1947b9CCc030B0F'
    const verifiedEmptyProposalCondition = '0x861Ef6b2F86B9343fB4A88bB8e11C1e8295F8d1e'
    const unknownCondition = '0x1111111111111111111111111111111111111111'

    const tokenVotingPlugin = '0xC0Ffee254729296a45a3885639AC7E10F9d54979'
    const multisigPlugin = '0xDe0B295669a9FD93d5F28D9Ec85E40f4cb697BAe'
    const sppPlugin = '0x36615Cf349d7F6344891B1e7CA7C72883F5dc049'
    const emptySelectorPlugin = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
    const verifiedEmptyPlugin = '0x26A65F77d4805eDab92a29ec964A0ac9891F9626'
    const tokenAddress = '0x0bA45A8b5d5575935B8158a88C631E9F9C95a2e5'
    const target = '0x902D99e5291ba7628AeD2b03dc533E4BBcAAA5aE'
    const minVotingPower = '1000000000000000000'

    let byPermission: Record<string, any>

    beforeEach(async () => {
      // Plugins that deployed the conditions. proposalCreationConditionAddress is
      // stored lower-cased to prove the case-insensitive match in the lookup.
      await Models.Plugin.collection.insertMany([
        {
          id: 'plugin-token-voting',
          address: tokenVotingPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenAddress,
          proposalCreationConditionAddress: votingCondition.toLowerCase(),
        },
        {
          id: 'plugin-multisig',
          address: multisigPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.multisig,
          proposalCreationConditionAddress: multisigCondition,
        },
        {
          id: 'plugin-spp',
          address: sppPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.spp,
          conditionAddress: selectorCondition,
        },
        {
          id: 'plugin-empty-selector',
          address: emptySelectorPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.spp,
          conditionAddress: emptySelectorCondition,
        },
        {
          id: 'plugin-verified-empty',
          address: verifiedEmptyPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.spp,
          conditionAddress: verifiedEmptyCondition,
          conditionInterfaceType: IConditionInterfaceType.executeSelector,
          proposalCreationConditionAddress: verifiedEmptyProposalCondition,
        },
      ] as any)

      await Models.Setting.collection.insertMany([
        {
          id: 'setting-token-voting',
          pluginAddress: tokenVotingPlugin,
          daoAddress,
          network,
          status: ISettingStatus.active,
          minProposerVotingPower: minVotingPower,
        },
        {
          id: 'setting-multisig',
          pluginAddress: multisigPlugin,
          daoAddress,
          network,
          status: ISettingStatus.active,
          onlyListed: true,
          minApprovals: 3,
        },
      ] as any)

      await Models.SelectorPermission.collection.insertMany([
        {
          id: 'selector-1',
          conditionAddress: selectorCondition,
          daoAddress,
          network,
          isAllowed: true,
          selector: '0xa9059cbb',
          target,
          chainId: 1,
        },
        {
          id: 'selector-2',
          conditionAddress: selectorCondition,
          daoAddress,
          network,
          isAllowed: true,
          selector: null,
          target,
          chainId: 8453,
        },
      ] as any)

      const grants = [
        { permissionId: '0xVOTING', whoAddress: '0xWHO_V', conditionAddress: votingCondition },
        { permissionId: '0xMEMBER', whoAddress: '0xWHO_M', conditionAddress: multisigCondition },
        { permissionId: '0xSELECTOR', whoAddress: '0xWHO_S', conditionAddress: selectorCondition },
        { permissionId: '0xEMPTY_SELECTOR', whoAddress: '0xWHO_E', conditionAddress: emptySelectorCondition },
        { permissionId: '0xVERIFIED_EMPTY', whoAddress: '0xWHO_VE', conditionAddress: verifiedEmptyCondition },
        {
          permissionId: '0xVE_PROPOSAL',
          whoAddress: '0xWHO_VP',
          conditionAddress: verifiedEmptyProposalCondition,
        },
        { permissionId: '0xUNKNOWN', whoAddress: '0xWHO_U', conditionAddress: unknownCondition },
        { permissionId: '0xNONE', whoAddress: '0xWHO_N', conditionAddress: undefined },
      ]
      for (let i = 0; i < grants.length; i++) {
        await Models.DaoPermission.create({
          network,
          blockNumber: 100 + i,
          transactionHash: `0x${i.toString().padStart(64, '0')}`,
          transactionIndex: 0,
          logIndex: i,
          daoAddress,
          permissionId: grants[i].permissionId,
          whoAddress: grants[i].whoAddress,
          whereAddress: daoAddress,
          conditionAddress: grants[i].conditionAddress,
          event: 'Granted',
        })
      }

      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })
      byPermission = Object.fromEntries(result.data.map((row: any) => [row.permissionId, row]))
    })

    it('resolves voting-power from the token-voting plugin (case-insensitive) with minVotingPower', () => {
      expect(byPermission['0xVOTING'].condition).to.deep.equal({
        conditionType: 'voting-power',
        token: tokenAddress,
        minVotingPower,
      })
    })

    it('resolves membership from the multisig plugin with onlyListed and minApprovals', () => {
      expect(byPermission['0xMEMBER'].condition).to.deep.equal({
        conditionType: 'membership',
        onlyListed: true,
        minApprovals: 3,
      })
    })

    it('resolves execute-selector with selectors and targets', () => {
      const { condition } = byPermission['0xSELECTOR']
      expect(condition.conditionType).to.equal('execute-selector')
      expect(condition.selectors).to.have.deep.members(['0xa9059cbb', null])
      expect(condition.targets).to.deep.equal([target, target])
      expect(condition.chainIds).to.deep.equal([1, 8453])
    })

    it('resolves unknown when the condition address matches nothing', () => {
      expect(byPermission['0xUNKNOWN'].condition).to.deep.equal({ conditionType: 'unknown' })
    })

    it('resolves unknown when the matched condition has no selector rows and is not bytecode-verified', () => {
      expect(byPermission['0xEMPTY_SELECTOR'].condition).to.deep.equal({ conditionType: 'unknown' })
    })

    it('resolves execute-selector with empty arrays for a bytecode-verified condition with no selector rows', () => {
      expect(byPermission['0xVERIFIED_EMPTY'].condition).to.deep.equal({
        conditionType: 'execute-selector',
        selectors: [],
        targets: [],
        chainIds: [],
      })
    })

    it('does not borrow the execute verdict for the same plugin proposal-creation condition', () => {
      expect(byPermission['0xVE_PROPOSAL'].condition).to.deep.equal({ conditionType: 'unknown' })
    })

    it('omits condition and returns ALLOW_FLAG conditionAddress when the grant has no condition', () => {
      expect(byPermission['0xNONE']).to.not.have.property('condition')
      expect(byPermission['0xNONE'].conditionAddress).to.equal('0x0000000000000000000000000000000000000002')
    })
  })

  describe('findWithPagination entity enrichment', () => {
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
    const linkedDaoAddress = '0xabababababababababababababababababababab'
    const topLevelPlugin = '0x3333333333333333333333333333333333333333'
    const processInternal = '0x4444444444444444444444444444444444444444'
    const processBody = '0x5555555555555555555555555555555555555555'
    const conditionAddress = '0x6666666666666666666666666666666666666666'
    const externalActor = '0x7777777777777777777777777777777777777777'
    const historicalPlugin = '0x8888888888888888888888888888888888888888'
    const contractAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const unknownAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    let byPermission: Record<string, IPermissionResponse>

    beforeEach(async () => {
      await Models.Dao.collection.insertMany([
        {
          id: `${network}-${daoAddress}`,
          address: daoAddress,
          network,
          name: 'Core Governance',
          avatar: 'ipfs://dao-avatar',
          isActive: true,
          isHidden: false,
          linkedAccounts: [linkedDaoAddress],
        },
        {
          id: `${network}-${linkedDaoAddress}`,
          address: linkedDaoAddress,
          network,
          name: 'Linked Treasury',
          avatar: 'ipfs://linked-avatar',
          isActive: true,
          isHidden: false,
          linkedAccounts: [],
        },
      ])

      await Models.Plugin.collection.insertMany([
        {
          id: 'plugin-top-level',
          address: topLevelPlugin,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.spp,
          name: 'Polling',
          isProcess: true,
          blockNumber: 100,
          subPlugins: [{ addresses: [processInternal], stageIndex: 1 }],
          proposalCreationConditionAddress: conditionAddress,
        },
        {
          id: 'plugin-process-body',
          address: processBody,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.multisig,
          name: 'Polling body',
          isBody: true,
          parentPlugin: topLevelPlugin,
          stageIndex: 0,
          blockNumber: 101,
        },
        {
          id: 'plugin-historical',
          address: historicalPlugin,
          daoAddress,
          network,
          status: IPluginStatus.uninstalled,
          interfaceType: IPluginInterfaceType.tokenVoting,
          name: 'Token Voting',
          blockNumber: 90,
          conditionAddress: unknownAddress,
          proposalCreationConditionAddress: unknownAddress,
        },
        {
          id: 'plugin-process-internal',
          address: processInternal,
          daoAddress,
          network,
          status: IPluginStatus.installed,
          interfaceType: IPluginInterfaceType.tokenVoting,
          name: 'Token Voting',
          blockNumber: 102,
        },
      ])

      await Models.Setting.collection.insertOne({
        id: 'setting-spp',
        pluginAddress: topLevelPlugin,
        daoAddress,
        network,
        status: ISettingStatus.active,
        externalProposers: [{ address: externalActor, proposalCreationConditionAddress: conditionAddress }],
        stages: [
          {
            stageIndex: 1,
            plugins: [
              {
                address: processInternal,
                brandId: VotingBodyBrandIdentity.SAFE,
                proposalCreationConditionAddress: conditionAddress,
              },
            ],
          },
        ],
      })

      await Models.Contract.collection.insertOne({
        id: `${contractAddress}-${network}`,
        address: contractAddress,
        network,
        bytecode: '0x1234',
        bytecodeHash: '0xhash',
      })

      const grants = [
        {
          permissionId: '0xTOP_LEVEL',
          whoAddress: externalActor,
          whereAddress: topLevelPlugin,
          conditionAddress,
        },
        {
          permissionId: '0xHISTORICAL',
          whoAddress: historicalPlugin,
          whereAddress: contractAddress,
          conditionAddress: unknownAddress,
        },
        {
          permissionId: '0xINTERNAL',
          whoAddress: linkedDaoAddress,
          whereAddress: processInternal,
          conditionAddress: undefined,
        },
        {
          permissionId: '0xBODY',
          whoAddress: processBody,
          whereAddress: daoAddress,
          conditionAddress,
        },
      ]

      for (let i = 0; i < grants.length; i++) {
        await Models.DaoPermission.create({
          network,
          blockNumber: 200 + i,
          transactionHash: `0x${i.toString().padStart(64, '0')}`,
          transactionIndex: 0,
          logIndex: i,
          daoAddress,
          permissionId: grants[i].permissionId,
          whoAddress: grants[i].whoAddress,
          whereAddress: grants[i].whereAddress,
          conditionAddress: grants[i].conditionAddress,
          event: 'Granted',
        })
      }

      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })
      byPermission = Object.fromEntries(result.data.map(row => [row.permissionId, row]))
    })

    it('classifies current plugins, external actors, and known conditions on permission rows', () => {
      expect(byPermission['0xTOP_LEVEL'].where).to.deep.equal({
        address: topLevelPlugin,
        layer: 'topLevelPlugin',
        label: 'Polling',
        interfaceType: IPluginInterfaceType.spp,
        status: 'installed',
        role: 'where',
      })
      expect(byPermission['0xTOP_LEVEL'].who).to.deep.equal({
        address: externalActor,
        layer: 'externalActor',
        label: 'External proposer',
        status: 'unknown',
        parentPluginAddress: topLevelPlugin,
        parentPluginName: 'Polling',
        parentInterfaceType: IPluginInterfaceType.spp,
        brandId: VotingBodyBrandIdentity.SAFE,
        proposalCreationConditionAddress: conditionAddress,
        role: 'who',
      })
      expect(byPermission['0xTOP_LEVEL'].conditionEntity).to.deep.equal({
        address: conditionAddress,
        layer: 'condition',
        label: 'Condition contract',
        status: 'installed',
        parentPluginAddress: topLevelPlugin,
        parentPluginName: 'Polling',
        parentInterfaceType: IPluginInterfaceType.spp,
        role: 'condition',
      })
    })

    it('classifies historical plugins, known contracts, and unknown condition addresses', () => {
      expect(byPermission['0xHISTORICAL'].who).to.deep.equal({
        address: historicalPlugin,
        layer: 'historicalPlugin',
        label: 'Historical Token Voting',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'uninstalled',
        role: 'who',
      })
      expect(byPermission['0xHISTORICAL'].where).to.deep.equal({
        address: contractAddress,
        layer: 'contract',
        label: 'Unresolved contract',
        status: 'unknown',
        role: 'where',
      })
      expect(byPermission['0xHISTORICAL'].conditionEntity).to.deep.equal({
        address: unknownAddress,
        layer: 'condition',
        label: 'Condition contract',
        status: 'uninstalled',
        parentPluginAddress: historicalPlugin,
        parentPluginName: 'Token Voting',
        parentInterfaceType: IPluginInterfaceType.tokenVoting,
        role: 'condition',
      })
    })

    it('classifies linked DAOs, process internals, and the allow flag sentinel', () => {
      expect(byPermission['0xINTERNAL'].who).to.deep.equal({
        address: linkedDaoAddress,
        layer: 'dao',
        label: 'Linked Treasury',
        avatarSrc: 'ipfs://linked-avatar',
        role: 'who',
      })
      expect(byPermission['0xINTERNAL'].where).to.deep.equal({
        address: processInternal,
        layer: 'processInternal',
        label: 'Token Voting',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'installed',
        parentPluginAddress: topLevelPlugin,
        parentPluginName: 'Polling',
        parentInterfaceType: IPluginInterfaceType.spp,
        stageIndex: 1,
        brandId: VotingBodyBrandIdentity.SAFE,
        proposalCreationConditionAddress: conditionAddress,
        role: 'where',
      })
      expect(byPermission['0xINTERNAL'].conditionEntity).to.deep.equal({
        address: '0x0000000000000000000000000000000000000002',
        layer: 'condition',
        label: 'Allow flag',
        status: 'unknown',
        role: 'condition',
      })
    })

    it('keeps legacy raw fields and conditionAddress on enriched rows', () => {
      const requiredRawFields: Array<keyof IPermissionResponse> = [
        'permissionId',
        'whoAddress',
        'whereAddress',
        'conditionAddress',
        'daoAddress',
        'network',
        'blockNumber',
        'transactionHash',
      ]
      const requireConditionAddress = (_conditionAddress: string) => {}

      for (const row of Object.values(byPermission)) {
        expect(row).to.include.all.keys(requiredRawFields)
        expect(row.whoAddress).to.be.a('string')
        expect(row.whereAddress).to.be.a('string')
        expect(row.daoAddress).to.equal(daoAddress)
        expect(row.network).to.equal(network)
        expect(row.blockNumber).to.be.a('number')
        expect(row.transactionHash).to.be.a('string')
      }

      expect(byPermission['0xINTERNAL'].conditionAddress).to.equal('0x0000000000000000000000000000000000000002')
      requireConditionAddress(byPermission['0xINTERNAL'].conditionAddress)
      expect(byPermission['0xINTERNAL']).to.include.all.keys(['whoAddress', 'whereAddress', 'who', 'where'])
    })

    it('prefers the current installed plugin over stale historical plugin docs', async () => {
      await Models.Plugin.collection.insertOne({
        id: 'plugin-top-level-stale-history',
        address: topLevelPlugin,
        daoAddress,
        network,
        status: IPluginStatus.uninstalled,
        interfaceType: IPluginInterfaceType.tokenVoting,
        name: 'Stale Token Voting',
        blockNumber: 300,
      })

      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 10, page: 1 },
      })
      const row = result.data.find(permission => permission.permissionId === '0xTOP_LEVEL')

      expect(row?.where).to.deep.equal({
        address: topLevelPlugin,
        layer: 'topLevelPlugin',
        label: 'Polling',
        interfaceType: IPluginInterfaceType.spp,
        status: 'installed',
        role: 'where',
      })
    })

    it('classifies linked DAOs even when the current page does not include the root DAO address', async () => {
      const result = await Models.DaoPermission.findWithPagination({
        extraParams: { daoAddress, network },
        paginationParams: { pageSize: 1, page: 2, sort: 'blockNumber', order: 'desc' },
      })

      expect(result.data[0].permissionId).to.equal('0xINTERNAL')
      expect(result.data[0].who).to.deep.equal({
        address: linkedDaoAddress,
        layer: 'dao',
        label: 'Linked Treasury',
        avatarSrc: 'ipfs://linked-avatar',
        role: 'who',
      })
    })

    it('classifies installed plugin body rows as process internals with parent context', () => {
      expect(byPermission['0xBODY'].who).to.deep.equal({
        address: processBody,
        layer: 'processInternal',
        label: 'Polling body',
        interfaceType: IPluginInterfaceType.multisig,
        status: 'installed',
        parentPluginAddress: topLevelPlugin,
        parentPluginName: 'Polling',
        parentInterfaceType: IPluginInterfaceType.spp,
        stageIndex: 0,
        role: 'who',
      })
      expect(byPermission['0xBODY'].where).to.deep.equal({
        address: daoAddress,
        layer: 'dao',
        label: 'Core Governance',
        avatarSrc: 'ipfs://dao-avatar',
        role: 'where',
      })
    })
  })

  describe('findActiveAcknowledgementPermission', () => {
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x1111111111111111111111111111111111111111'
    const whoAddress = '0x2222222222222222222222222222222222222222'
    const permissionId = '0xACKNOWLEDGEMENT_PERMISSION_ID'

    it('should return granted permission when it is the latest event', async () => {
      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.not.be.null
      expect(result?.event).to.equal('Granted')
      expect(result?.blockNumber).to.equal(100)
    })

    it('should return null when the latest event is Revoked', async () => {
      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 200,
        transactionHash: '0x02',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Revoked',
      })

      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.be.null
    })

    it('should return the permission if granted after being revoked', async () => {
      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 200,
        transactionHash: '0x02',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Revoked',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 300,
        transactionHash: '0x03',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.not.be.null
      expect(result?.event).to.equal('Granted')
      expect(result?.blockNumber).to.equal(300)
    })

    it('should return null when no permission exists', async () => {
      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.be.null
    })

    it('should correctly sort by block number, transaction index, and log index', async () => {
      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x02',
        transactionIndex: 1,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress,
        whereAddress: daoAddress,
        event: 'Revoked',
      })

      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.be.null
    })

    it('should only match the exact permission criteria', async () => {
      const differentWho = '0x3333333333333333333333333333333333333333'

      await Models.DaoPermission.create({
        network,
        blockNumber: 100,
        transactionHash: '0x01',
        transactionIndex: 0,
        logIndex: 0,
        daoAddress,
        permissionId,
        whoAddress: differentWho,
        whereAddress: daoAddress,
        event: 'Granted',
      })

      const result = await Models.DaoPermission.findActiveAcknowledgementPermission(
        network,
        daoAddress,
        whoAddress,
        permissionId,
      )

      expect(result).to.be.null
    })
  })
})
