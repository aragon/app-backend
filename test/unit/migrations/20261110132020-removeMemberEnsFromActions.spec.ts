import { Models } from '@dbModels'
import logger from '@logger'
import { removeMemberEnsFromActionsMigration } from '@src/migrations/20261110132020-removeMemberEnsFromActions'
import { ProposalList } from '@test/mock/fakeProposal'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const dao = '0x19E246564b3264fed309D3D004f807D5887e5522'
const alice = '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'
const bob = '0x0000000000000000000000000000000000000002'
const safeTxHash = `0x${'d'.repeat(64)}`

const nativeTransfer = () => ({
  type: 'TransferNative',
  sender: { address: dao, ens: 'dao.eth' },
  receiver: { address: alice, ens: 'alice.eth', avatar: 'alice.png' },
})

async function seedProposal(id: string, actions: any[]) {
  await Models.Proposal.create({ ...ProposalList[0], id, actions })
}

async function proposalActions(id: string) {
  return (await Models.Proposal.findOne({ id }, { actions: 1 }).lean())!.actions
}

describe('Migration: removeMemberEnsFromActions', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('removes the receiver name from a native transfer and keeps the DAO name', async () => {
    await seedProposal('transfer', [nativeTransfer()])

    await removeMemberEnsFromActionsMigration.start()

    expect(await proposalActions('transfer')).to.deep.equal([
      {
        type: 'TransferNative',
        sender: { address: dao, ens: 'dao.eth' },
        receiver: { address: alice, avatar: 'alice.png' },
      },
    ])
  })

  it('removes the receiver name from a mint in an execution', async () => {
    await Models.Transaction.create({
      ...FakeTransaction,
      id: 'execution',
      side: ITransactionSide.execution,
      type: ITransactionType.execution,
      actions: [{ type: 'Mint', receivers: { address: alice, ens: null, currentBalance: '0', newBalance: '5' } }],
    })

    await removeMemberEnsFromActionsMigration.start()

    const execution = await Models.Transaction.findOne({ id: 'execution' }, { actions: 1 }).lean()
    expect(execution!.actions).to.deep.equal([
      { type: 'Mint', receivers: { address: alice, currentBalance: '0', newBalance: '5' } },
    ])
  })

  it('removes the member names from a member change in a Safe transaction', async () => {
    await Models.SafeTransaction.create({
      id: Models.SafeTransaction.buildId(NetworksEnum.ethereumMainnet, dao, safeTxHash),
      network: NetworksEnum.ethereumMainnet,
      safeAddress: dao,
      safeTxHash,
      nonce: '6',
      to: dao,
      rawActions: [],
      actions: [
        {
          type: 'MultisigAddMembers',
          members: [
            { address: alice, ens: 'alice.eth', avatar: null },
            { address: bob, ens: null },
          ],
        },
      ],
      decoding: false,
      refreshedAt: new Date(),
    })

    await removeMemberEnsFromActionsMigration.start()

    const safeTransaction = await Models.SafeTransaction.findOne({ safeTxHash }, { actions: 1 }).lean()
    expect(safeTransaction!.actions).to.deep.equal([
      { type: 'MultisigAddMembers', members: [{ address: alice, avatar: null }, { address: bob }] },
    ])
  })

  it('removes the names from nested actions', async () => {
    const twoLevelsDown = { type: 'Execute', inputData: { actions: [nativeTransfer()] } }
    await seedProposal('nested', [{ type: 'Execute', inputData: { actions: [nativeTransfer(), twoLevelsDown] } }])

    await removeMemberEnsFromActionsMigration.start()

    const cleanTransfer = {
      type: 'TransferNative',
      sender: { address: dao, ens: 'dao.eth' },
      receiver: { address: alice, avatar: 'alice.png' },
    }
    expect(await proposalActions('nested')).to.deep.equal([
      {
        type: 'Execute',
        inputData: { actions: [cleanTransfer, { type: 'Execute', inputData: { actions: [cleanTransfer] } }] },
      },
    ])
  })

  it('removes the names across more than one batch', async () => {
    await Models.Proposal.collection.insertMany(
      Array.from({ length: 501 }, (_, i) => ({ ...ProposalList[0], id: `proposal-${i}`, actions: [nativeTransfer()] })),
    )

    await removeMemberEnsFromActionsMigration.start()

    expect(await Models.Proposal.countDocuments({ 'actions.receiver.ens': { $exists: true } })).to.equal(0)
    expect(await Models.Proposal.countDocuments({ 'actions.sender.ens': 'dao.eth' })).to.equal(501)
  })

  it('leaves a row without member names untouched', async () => {
    await seedProposal('clean', [
      { type: 'Transfer', sender: { address: dao, ens: 'dao.eth' }, receiver: { address: alice } },
      { type: 'Unknown', inputData: null },
    ])
    const before = await Models.Proposal.findOne({ id: 'clean' }).lean()

    await removeMemberEnsFromActionsMigration.start()

    expect(await Models.Proposal.findOne({ id: 'clean' }).lean()).to.deep.equal(before)
  })

  it('changes nothing on a second run', async () => {
    await seedProposal('transfer', [nativeTransfer()])
    await removeMemberEnsFromActionsMigration.start()
    const afterFirst = await Models.Proposal.find({}).lean()

    await removeMemberEnsFromActionsMigration.start()

    expect(await Models.Proposal.find({}).lean()).to.deep.equal(afterFirst)
  })
})
