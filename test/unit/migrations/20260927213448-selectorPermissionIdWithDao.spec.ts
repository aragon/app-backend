import { Models } from '@dbModels'
import logger from '@logger'
import selectorPermissionIdWithDaoMigration from '@src/migrations/20260927213448-selectorPermissionIdWithDao'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const DAO_A = '0x32d627b081e0f4fF28474820f20128049DA55360'
const DAO_B = '0x5B72fbB65339a8A0032C2d823520d697a0265c50'
const PLUGIN_A = '0xC3611e534d37eC6cAE251CECc06b25CCfA088e7c'
const PLUGIN_B = '0x6A4bA2c50dC04e4BFbA572F0fa4CbC0e3Dd4b6a5'
const CONDITION_ADDRESS = '0xDC6f14D31A1f01784F0954eb90b675a4332D80A6'
const TRANSACTION_HASH = '0xb07380e446629624458fb3a6a9ae781352b0f2b764056b1e7d7839bef5a4f89e'

const oldId = (logIndex: number) =>
  `${NetworksEnum.baseMainnet}-${TRANSACTION_HASH}-49-${logIndex}-${CONDITION_ADDRESS}`

const selectorPermission = (logIndex: number, daoAddress: string, pluginAddress: string, id = oldId(logIndex)) => ({
  id,
  transactionHash: TRANSACTION_HASH,
  transactionIndex: 49,
  logIndex,
  blockNumber: 34567890,
  network: NetworksEnum.baseMainnet,
  pluginAddress,
  daoAddress,
  conditionAddress: CONDITION_ADDRESS,
  selector: '0x3628731c',
  isAllowed: true,
})

describe('migration: selector permission id with dao', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('rewrites old ids with the dao and plugin address and leaves new ones as they are', async () => {
    await Models.SelectorPermission.collection.insertMany([
      selectorPermission(1, DAO_A, PLUGIN_A),
      selectorPermission(2, DAO_B, PLUGIN_B),
      selectorPermission(3, DAO_A, PLUGIN_A, `${oldId(3)}-${DAO_A}-${PLUGIN_A}`),
    ] as any)

    await selectorPermissionIdWithDaoMigration.start()
    await selectorPermissionIdWithDaoMigration.start()

    const ids = await Models.SelectorPermission.distinct('id')
    expect(ids).to.have.members([
      `${oldId(1)}-${DAO_A}-${PLUGIN_A}`,
      `${oldId(2)}-${DAO_B}-${PLUGIN_B}`,
      `${oldId(3)}-${DAO_A}-${PLUGIN_A}`,
    ])
  })
})
