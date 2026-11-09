import { Models } from '@dbModels'
import logger from '@logger'
import fixVeLockDelegateReceiverMigration from '@src/migrations/20261109232359-fixVeLockDelegateReceiver'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon, { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const TOKEN = '0x0000000000000000000000000000000000000AA1'
const OLD_DELEGATE = '0x0000000000000000000000000000000000000CC1'
const NEW_DELEGATE = '0x0000000000000000000000000000000000000CC2'

const lock = (tokenId: string, delegateReceiverAddress: string | null) => ({
  id: `lock-${tokenId}`,
  network: NETWORK,
  tokenAddress: TOKEN,
  tokenId,
  delegateReceiverAddress,
})

const delegation = (
  tokenId: string,
  action: 'delegate' | 'undelegate',
  delegate: string,
  transactionIndex: number,
  logIndex: number,
) => ({
  id: `event-${tokenId}-${transactionIndex}-${logIndex}`,
  network: NETWORK,
  contractAddress: TOKEN,
  tokenIds: [tokenId],
  action,
  delegate,
  blockNumber: 100,
  transactionIndex,
  logIndex,
})

describe('migration: fix ve lock delegate receiver', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('takes the latest delegate and leaves a correct lock alone', async () => {
    await Models.Lock.collection.insertMany([lock('1', null), lock('2', NEW_DELEGATE)] as any)
    await Models.TokenDelegation.collection.insertMany([
      delegation('1', 'delegate', NEW_DELEGATE, 0, 385),
      delegation('2', 'delegate', NEW_DELEGATE, 0, 386),
      delegation('1', 'undelegate', OLD_DELEGATE, 0, 384),
    ] as any)
    const bulkWrite = sandbox.spy(Models.Lock, 'bulkWrite')

    await fixVeLockDelegateReceiverMigration.start()

    expect((await Models.Lock.collection.findOne({ id: 'lock-1' }))?.delegateReceiverAddress).to.equal(NEW_DELEGATE)
    expect((await Models.Lock.collection.findOne({ id: 'lock-2' }))?.delegateReceiverAddress).to.equal(NEW_DELEGATE)
    expect(bulkWrite.calledOnce).to.be.true
    expect(bulkWrite.firstCall.args[0]).to.have.lengthOf(1)
    expect(bulkWrite.firstCall.args[0][0].updateOne.update.$set.delegateReceiverAddress).to.equal(NEW_DELEGATE)
  })

  it('clears a lock when the latest event undelegates it', async () => {
    await Models.Lock.collection.insertOne(lock('1', OLD_DELEGATE) as any)
    await Models.TokenDelegation.collection.insertMany([
      delegation('1', 'undelegate', OLD_DELEGATE, 1, 1),
      delegation('1', 'delegate', OLD_DELEGATE, 0, 99),
    ] as any)

    await fixVeLockDelegateReceiverMigration.start()

    expect((await Models.Lock.collection.findOne({ id: 'lock-1' }))?.delegateReceiverAddress).to.be.null
  })
})
