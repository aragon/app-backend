import { Models } from '@dbModels'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import backfillLockBlockTimestampMigration from '@src/migrations/20260508082351-backfillLockBlockTimestamp'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: backfillLockBlockTimestamp', () => {
  let sandbox: SinonSandbox

  let counter = 0
  const uid = (prefix: string) => `${prefix}-${++counter}`

  const seedLock = async (overrides: Partial<Record<string, any>>) =>
    Models.Lock.collection.insertOne({
      id: uid('lock'),
      escrowAddress: '0xescrowaddress',
      tokenAddress: '0xtokenaddress',
      nftAddress: '0xnftaddress',
      exitQueueAddress: '0xexitqueueaddress',
      tokenId: '1',
      amount: '1000000000000000000',
      epochStartAt: 1700000000,
      totalLocked: '1000000000000000000',
      transactionHash: '0xtxhash',
      transactionIndex: 0,
      logIndex: 0,
      memberAddress: '0xmemberaddress',
      ...overrides,
    } as any)

  const fetchLockById = async (id: string) => Models.Lock.collection.findOne({ id })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('backfills blockTimestamp for null rows using the timestamp map per network', async () => {
    const id1 = uid('lock')
    const id2 = uid('lock')
    await seedLock({ id: id1, network: NetworksEnum.ethereumMainnet, blockNumber: 100, blockTimestamp: null })
    await seedLock({ id: id2, network: NetworksEnum.ethereumMainnet, blockNumber: 200, blockTimestamp: null })

    const stub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps')
    stub
      .withArgs(
        sinon.match((arg: number[]) => arg.includes(100) && arg.includes(200)),
        NetworksEnum.ethereumMainnet,
      )
      .resolves(
        new Map([
          [100, 1700000100],
          [200, 1700000200],
        ]),
      )

    await backfillLockBlockTimestampMigration.start()

    const lock1 = await fetchLockById(id1)
    const lock2 = await fetchLockById(id2)
    expect(lock1?.blockTimestamp).to.eq(1700000100)
    expect(lock2?.blockTimestamp).to.eq(1700000200)
  })

  it('does not touch locks that already have a blockTimestamp', async () => {
    const id = uid('lock')
    await seedLock({ id, network: NetworksEnum.ethereumMainnet, blockNumber: 100, blockTimestamp: 1690000000 })

    const stub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(new Map())

    await backfillLockBlockTimestampMigration.start()

    const lock = await fetchLockById(id)
    expect(lock?.blockTimestamp).to.eq(1690000000)
    expect(stub.called).to.be.false
  })

  it('processes locks across multiple networks independently', async () => {
    const idEth = uid('lock')
    const idPeaq = uid('lock')
    await seedLock({ id: idEth, network: NetworksEnum.ethereumMainnet, blockNumber: 50, blockTimestamp: null })
    await seedLock({ id: idPeaq, network: NetworksEnum.peaqMainnet, blockNumber: 75, blockTimestamp: null })

    const stub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps')
    stub.withArgs(sinon.match.array, NetworksEnum.ethereumMainnet).resolves(new Map([[50, 1700050000]]))
    stub.withArgs(sinon.match.array, NetworksEnum.peaqMainnet).resolves(new Map([[75, 1700075000]]))

    await backfillLockBlockTimestampMigration.start()

    const lockEth = await fetchLockById(idEth)
    const lockPeaq = await fetchLockById(idPeaq)
    expect(lockEth?.blockTimestamp).to.eq(1700050000)
    expect(lockPeaq?.blockTimestamp).to.eq(1700075000)
  })

  it('shares one timestamp across all locks at the same blockNumber', async () => {
    const idA = uid('lock')
    const idB = uid('lock')
    await seedLock({
      id: idA,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 500,
      tokenId: 'A',
      blockTimestamp: null,
    })
    await seedLock({
      id: idB,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 500,
      tokenId: 'B',
      blockTimestamp: null,
    })

    sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(new Map([[500, 1700500000]]))

    await backfillLockBlockTimestampMigration.start()

    const lockA = await fetchLockById(idA)
    const lockB = await fetchLockById(idB)
    expect(lockA?.blockTimestamp).to.eq(1700500000)
    expect(lockB?.blockTimestamp).to.eq(1700500000)
  })

  it('leaves blockTimestamp null when the RPC batch returns no entry for that block', async () => {
    const id = uid('lock')
    await seedLock({ id, network: NetworksEnum.ethereumMainnet, blockNumber: 999, blockTimestamp: null })

    sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(new Map())

    await backfillLockBlockTimestampMigration.start()

    const lock = await fetchLockById(id)
    expect(lock?.blockTimestamp).to.be.null
  })

  it('is idempotent: re-running does not change anything after the first pass', async () => {
    const id = uid('lock')
    await seedLock({ id, network: NetworksEnum.ethereumMainnet, blockNumber: 700, blockTimestamp: null })

    const stub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(new Map([[700, 1700700000]]))

    await backfillLockBlockTimestampMigration.start()
    const after1 = await fetchLockById(id)

    await backfillLockBlockTimestampMigration.start()
    const after2 = await fetchLockById(id)

    expect(after1?.blockTimestamp).to.eq(1700700000)
    expect(after2?.blockTimestamp).to.eq(1700700000)
    expect(stub.callCount).to.eq(1)
  })
})
