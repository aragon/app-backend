import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import { IPermission } from '@src/types/permission'
import RegisterSafeProcesses, { findHeldExecuteGrants } from '@tools/registerSafeProcesses'
import { type HexAddress, IEventLogPermission, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = '0x5B72fbB65339a8A0032C2d823520d697a0265c50' as HexAddress
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const OTHER_SAFE = '0x2222222222222222222222222222222222222222' as HexAddress
const CONDITION = '0x3333333333333333333333333333333333333333' as HexAddress
const EXECUTE = ethers.id(IPermission.EXECUTE_PERMISSION)

const grant = (whoAddress: HexAddress, blockNumber: number, extra: object = {}) =>
  Models.DaoPermission.create({
    network: NETWORK,
    blockNumber,
    transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
    transactionIndex: 0,
    logIndex: 0,
    daoAddress: DAO,
    whereAddress: DAO,
    whoAddress,
    permissionId: EXECUTE,
    event: IEventLogPermission.Granted,
    ...extra,
  })

describe('Tools: RegisterSafeProcesses', () => {
  let sandbox: SinonSandbox
  const previousEnv = { EXECUTE: process.env.EXECUTE, TARGET_NETWORK: process.env.TARGET_NETWORK }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    process.env.EXECUTE = 'true'
    delete process.env.TARGET_NETWORK
    // one Safe granted with a condition, another whose newest grant dropped its condition
    await grant(SAFE, 10, { conditionAddress: CONDITION })
    await grant(OTHER_SAFE, 11, { conditionAddress: CONDITION })
    await grant(OTHER_SAFE, 12)
  })

  afterEach(() => {
    sandbox.restore()
    if (previousEnv.EXECUTE == null) delete process.env.EXECUTE
    else process.env.EXECUTE = previousEnv.EXECUTE
    if (previousEnv.TARGET_NETWORK != null) process.env.TARGET_NETWORK = previousEnv.TARGET_NETWORK
  })

  it('carries the newest grant condition, null when the latest grant has none', async () => {
    const grants = await findHeldExecuteGrants(NETWORK)

    const byWho = Object.fromEntries(grants.map(row => [row.whoAddress, row.conditionAddress]))
    expect(byWho).to.deep.equal({ [SAFE]: CONDITION, [OTHER_SAFE]: null })
  })

  it('applies the condition after registration and keeps going when one grant fails', async () => {
    const install = sandbox.stub(PluginHandler, 'installSafeOnPermissionGranted')
    install.withArgs(DAO, SAFE).rejects(new Error('node hiccup'))
    install.withArgs(DAO, OTHER_SAFE).resolves({ id: 'plugin' } as never)
    const condition = sandbox.stub(PluginHandler, 'updateConditionAddress').resolves()

    await RegisterSafeProcesses.start()

    expect(install.callCount).to.equal(2)
    expect(condition.calledOnceWithExactly(OTHER_SAFE, DAO, NETWORK, null)).to.be.true
  })

  it('writes nothing on a dry run', async () => {
    process.env.EXECUTE = 'false'
    const install = sandbox.stub(PluginHandler, 'installSafeOnPermissionGranted').resolves()

    await RegisterSafeProcesses.start()

    expect(install.notCalled).to.be.true
  })
})
