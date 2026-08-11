import { Models } from '@dbModels'
import TelegramNotifier from '@helpers/telegramNotifier'
import { EndingSoonNotifier } from '@services/aragon-telegram/helpers/endingSoonNotifier'
import { ProposalList } from '@test/mock/fakeProposal'
import { type HexAddress, ITelegramNotificationEvent, ITelegramSubscriptionStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStub } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const TG_USER_ID = 755403189

const nowSec = () => Math.floor(Date.now() / 1000)

const seedSubscription = async () => {
  const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
  await sub.addDaoSubscription({ network: NETWORK, daoAddress: DAO })
  return sub
}

const seedProposal = async (overrides: Record<string, any>) => {
  // Proposal.create writes the computed id back onto its input, so a shared
  // fixture object may already carry one — drop it to derive a fresh id.
  const { id: _staleId, ...base } = ProposalList[0] as Record<string, any>
  return Models.Proposal.create({
    ...base,
    network: NETWORK,
    daoAddress: DAO,
    ...overrides,
  })
}

describe('AragonTelegram: EndingSoonNotifier', () => {
  let sandbox: SinonSandbox
  let publishStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    publishStub = sandbox.stub(TelegramNotifier, 'publishOrThrow').resolves()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('publishes a proposal.ending-soon event for proposals inside the reminder window', async () => {
    await seedSubscription()
    const inWindow = await seedProposal({
      transactionHash: '0xInWindow',
      proposalIndex: '10',
      endDate: nowSec() + 60 * 60,
    })

    await EndingSoonNotifier.start()

    expect(publishStub.calledOnce).to.be.true
    expect(publishStub.firstCall.args[0]).to.deep.eq({
      id: `proposal-ending:${inWindow.id}`,
      event: ITelegramNotificationEvent.ProposalEnding,
      network: NETWORK,
      daoAddress: DAO,
      proposalId: inWindow.id,
    })
  })

  it('skips proposals outside the window, already ended, or already executed', async () => {
    await seedSubscription()
    await seedProposal({
      transactionHash: '0xFarFuture',
      proposalIndex: '11',
      endDate: nowSec() + 48 * 60 * 60,
    })
    await seedProposal({
      transactionHash: '0xEnded',
      proposalIndex: '12',
      endDate: nowSec() - 100,
    })
    await seedProposal({
      transactionHash: '0xExecuted',
      proposalIndex: '13',
      endDate: nowSec() + 60 * 60,
      executed: { status: true, transactionHash: null, blockNumber: null, blockTimestamp: null },
    })

    await EndingSoonNotifier.start()

    expect(publishStub.notCalled).to.be.true
  })

  it('reminds each proposal at most once across runs', async () => {
    await seedSubscription()
    await seedProposal({
      transactionHash: '0xOnce',
      proposalIndex: '14',
      endDate: nowSec() + 60 * 60,
    })

    await EndingSoonNotifier.start()
    await EndingSoonNotifier.start()

    expect(publishStub.calledOnce).to.be.true
  })

  it('skips the sub-proposals of an SPP stage', async () => {
    await seedSubscription()
    await seedProposal({
      transactionHash: '0xSubProposal',
      proposalIndex: '17',
      endDate: nowSec() + 60 * 60,
      isSubProposal: true,
    })

    await EndingSoonNotifier.start()

    expect(publishStub.notCalled).to.be.true
  })

  it('reminds again on the next run when the queue was down', async () => {
    await seedSubscription()
    const proposal = await seedProposal({
      transactionHash: '0xQueueDown',
      proposalIndex: '18',
      endDate: nowSec() + 60 * 60,
    })

    publishStub.rejects(new Error('rabbit down'))
    await expect(EndingSoonNotifier.start()).to.be.rejectedWith('rabbit down')

    publishStub.resolves()
    await EndingSoonNotifier.start()

    expect(publishStub.calledTwice).to.be.true
    expect(publishStub.secondCall.args[0].proposalId).to.eq(proposal.id)
  })

  it('does nothing without an active subscriber for the DAO', async () => {
    const sub = await seedSubscription()
    await sub.setStatus(ITelegramSubscriptionStatus.Paused)
    await seedProposal({
      transactionHash: '0xNoSubs',
      proposalIndex: '15',
      endDate: nowSec() + 60 * 60,
    })

    await EndingSoonNotifier.start()

    expect(publishStub.notCalled).to.be.true
  })

  it('skips DAOs whose subscribers opted out of the ending-soon event', async () => {
    const sub = await seedSubscription()
    await sub.setEvents({ network: NETWORK, daoAddress: DAO }, [
      ITelegramNotificationEvent.ProposalCreated,
      ITelegramNotificationEvent.VoteCast,
    ])
    await seedProposal({
      transactionHash: '0xOptedOut',
      proposalIndex: '16',
      endDate: nowSec() + 60 * 60,
    })

    await EndingSoonNotifier.start()

    expect(publishStub.notCalled).to.be.true
  })
})
