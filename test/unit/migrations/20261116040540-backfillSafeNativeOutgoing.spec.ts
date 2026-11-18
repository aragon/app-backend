import { Models } from '@dbModels'
import utils from '@helpers/utils'
import logger from '@logger'
import backfillSafeNativeOutgoingMigration from '@src/migrations/20261116040540-backfillSafeNativeOutgoing'
import { FakeToken } from '@test/mock/fakeToken'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { type HexAddress, ITokenType, ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const SAFE = '0x27CE7C8c1675c3b57046Cf56d96061693B6123e8' as HexAddress
const UNTRACKED_SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const RECIPIENT = '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB' as HexAddress
const CONTRACT = '0x9332620B88A26e0e6e0E0e83CC9C7474ea61A62C' as HexAddress
const SEND_TX = '0xc2bd1351a2703c954871274085ea2531b4d9f0e7d5e5e6443b9fc73ca35b499c' as HexAddress
const CALL_TX = '0x315114d7cb20c091cd59d5aad5d1d818e112ac0efdf45c82e0b5ea0a07bca2f6' as HexAddress
const SEND_SAFE_TX = '0xd8e9d36ca4a6080f0eaf749a04116667bbc7790cf5cc3bade31aceea76d9a9dd'
const CALL_SAFE_TX = '0x0d6f299bc6efd5847669c70fb18eac54145fe81f96b1653fc408a64e2cf13865'

/** One executed Safe transaction as the store holds it: the Safe service row and its execution row. */
const seedExecution = async (
  safeAddress: HexAddress,
  safeTxHash: string,
  transactionHash: HexAddress,
  sent: { to: HexAddress; value: string; data: string | null },
  mined: { blockNumber: number; transactionIndex: number; logIndex: number },
) => {
  await Models.SafeTransaction.create({
    id: Models.SafeTransaction.buildId(NETWORK, safeAddress, safeTxHash),
    network: NETWORK,
    safeAddress,
    safeTxHash,
    nonce: '0',
    state: 'executed',
    operation: 0,
    isSuccessful: true,
    transactionHash,
    refreshedAt: new Date(),
    ...sent,
  })
  await Models.Transaction.create({
    ...FakeTransaction,
    ...mined,
    network: NETWORK,
    daoAddress: safeAddress,
    transactionHash,
    blockTimestamp: 1700000000,
    type: ITransactionType.execution,
    side: ITransactionSide.execution,
    fromAddress: RECIPIENT,
    toAddress: safeAddress,
    value: '0',
    amountUsd: '0',
    tokenAddress: null,
    pluginAddress: null,
    token: null,
    safeTxHash,
    isSuccessful: true,
  })
}

describe('migration: backfill Safe native outgoing', () => {
  let sandbox: sinon.SinonSandbox

  const nativeRows = () => Models.Transaction.find({ network: NETWORK, type: ITransactionType.native }).lean()

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    for (const level of ['info', 'verbose', 'error'] as const) sandbox.stub(logger, level)
    await Models.Token.create({
      ...FakeToken,
      id: `${utils.zeroAddress}-${NETWORK}`,
      network: NETWORK,
      address: utils.zeroAddress,
      type: ITokenType.native,
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    })
    await Models.SafeAccount.track(NETWORK, SAFE)
    await seedExecution(
      SAFE,
      SEND_SAFE_TX,
      SEND_TX,
      { to: RECIPIENT, value: '5000000000000000', data: null },
      { blockNumber: 26022767, transactionIndex: 44, logIndex: 124 },
    )
    await seedExecution(
      SAFE,
      CALL_SAFE_TX,
      CALL_TX,
      { to: CONTRACT, value: '0', data: '0xc71bf324' },
      { blockNumber: 26031884, transactionIndex: 42, logIndex: 47 },
    )
    await seedExecution(
      UNTRACKED_SAFE,
      SEND_SAFE_TX,
      SEND_TX,
      { to: RECIPIENT, value: '5000000000000000', data: null },
      { blockNumber: 26022767, transactionIndex: 44, logIndex: 124 },
    )
  })

  afterEach(() => sandbox.restore())

  it('adds the withdraw row for the native a tracked Safe sent out', async () => {
    expect(await nativeRows()).to.have.length(0)

    await backfillSafeNativeOutgoingMigration.start()

    const rows = await nativeRows()
    expect(rows).to.have.length(1)
    expect(rows[0]).to.include({
      id: `${SAFE}-${NETWORK}-${SEND_TX}-native-action0`,
      side: ITransactionSide.withdraw,
      daoAddress: SAFE,
      fromAddress: SAFE,
      toAddress: RECIPIENT,
      value: '0.005',
      tokenAddress: utils.zeroAddress,
      transactionHash: SEND_TX,
      blockNumber: 26022767,
      blockTimestamp: 1700000000,
      transactionIndex: 44,
      logIndex: 124,
      actionIndex: 0,
    })
    expect(rows[0].token).to.include({ type: ITokenType.native, symbol: 'ETH', decimals: 18 })
  })

  it('keeps the same rows when it runs again', async () => {
    await backfillSafeNativeOutgoingMigration.start()
    const total = await Models.Transaction.countDocuments()

    await backfillSafeNativeOutgoingMigration.start()

    expect(await nativeRows()).to.have.length(1)
    expect(await Models.Transaction.countDocuments()).to.equal(total)
  })
})
