import config from '@config'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import TenderlyCache from '@modules/tenderly/cache'
import TenderlyProposal from '@modules/tenderly/proposal'
import { ProposalList } from '@test/mock/fakeProposal'
import { ISimulationStatus, ITenderlyOperation } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const raw = ProposalList[1] as any
let id: string

const result = () => ({
  status: ISimulationStatus.SUCCESS,
  url: 'https://share.url',
  runAt: Date.now(),
  network: raw.network,
})

const seed = (changes: Record<string, unknown> = {}) => Models.Proposal.create({ ...raw, id, ...changes })

describe('Module: tenderly proposal', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    id = Models.Proposal.getEntityId({
      transactionHash: raw.transactionHash,
      pluginAddress: raw.pluginAddress,
      proposalIndex: raw.proposalIndex,
    })
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('load', () => {
    it('answers 404 when the proposal is missing or has no actions', async () => {
      await seed({ rawActions: [] })

      const missing: any = await TenderlyProposal.load('missing').catch(error => error)
      const empty: any = await TenderlyProposal.load(id).catch(error => error)

      expect(missing.message).to.equal('notFound')
      expect(missing.status).to.equal(404)
      expect(empty.message).to.equal('notFound')
    })
  })

  describe('inputHash', () => {
    it('is the proposal cache key over the indexed actions', async () => {
      const proposal = await seed()

      expect(TenderlyProposal.inputHash(proposal)).to.equal(
        TenderlyCache.key(ITenderlyOperation.proposal, {
          proposalId: id,
          network: raw.network,
          daoAddress: raw.daoAddress,
          from: raw.pluginAddress,
          actions: raw.rawActions,
        }),
      )
    })
  })

  describe('recent', () => {
    it('gives back a fresh result for the same input with its original run time', async () => {
      const runAt = Date.now() - 1000
      const proposal = await seed()
      const inputHash = TenderlyProposal.inputHash(proposal)
      await Models.Proposal.updateOne(
        { id },
        { $set: { simulation: { inputHash, url: 'https://share.url', runAt, status: 'success' } } },
      )
      const stored = (await Models.Proposal.findByEntityId(id))!

      expect(TenderlyProposal.recent(stored, inputHash)).to.deep.equal({
        status: ISimulationStatus.SUCCESS,
        url: 'https://share.url',
        runAt,
        network: raw.network,
      })
    })

    it('ignores a saved result that has no url', async () => {
      const proposal = await seed()
      const inputHash = TenderlyProposal.inputHash(proposal)
      await Models.Proposal.updateOne(
        { id },
        { $set: { simulation: { inputHash, runAt: Date.now(), status: 'success' } } },
      )
      const stored = (await Models.Proposal.findByEntityId(id))!

      expect(TenderlyProposal.recent(stored, inputHash)).to.be.null
    })

    it('ignores a legacy result that has no input hash', async () => {
      const proposal = await seed({ simulation: { url: 'https://old', runAt: Date.now(), status: 'success' } })

      expect(TenderlyProposal.recent(proposal, TenderlyProposal.inputHash(proposal))).to.be.null
    })

    it('ignores a result for other actions', async () => {
      const proposal = await seed({
        simulation: { inputHash: 'other', url: 'https://share.url', runAt: Date.now(), status: 'success' },
      })

      expect(TenderlyProposal.recent(proposal, TenderlyProposal.inputHash(proposal))).to.be.null
    })

    it('ignores a result older than the re-simulation time', async () => {
      const proposal = await seed()
      const inputHash = TenderlyProposal.inputHash(proposal)
      const runAt = Date.now() - config.TENDERLY.RE_SIMULATION_TIME
      await Models.Proposal.updateOne(
        { id },
        { $set: { simulation: { inputHash, url: 'https://share.url', runAt, status: 'success' } } },
      )
      const stored = (await Models.Proposal.findByEntityId(id))!

      expect(TenderlyProposal.recent(stored, inputHash)).to.be.null
    })
  })

  describe('save', () => {
    it('stores the result with the input hash', async () => {
      const proposal = await seed()
      const inputHash = TenderlyProposal.inputHash(proposal)
      const saved = result()

      await TenderlyProposal.save(id, inputHash, saved)

      const stored = (await Models.Proposal.findByEntityId(id))!
      expect(stored.simulation).to.deep.include({
        inputHash,
        url: saved.url,
        runAt: saved.runAt,
        status: ISimulationStatus.SUCCESS,
      })
    })

    it('answers 503 and keeps the old result when the actions changed since the input was read', async () => {
      const proposal = await seed({ simulation: { url: 'https://old', runAt: 1, status: 'failed' } })
      const inputHash = TenderlyProposal.inputHash(proposal)
      await Models.Proposal.updateOne({ id }, { $set: { 'rawActions.0.value': '1' } })

      const thrown: any = await TenderlyProposal.save(id, inputHash, result()).catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)
      const stored = (await Models.Proposal.findByEntityId(id))!
      expect(stored.simulation).to.deep.include({ url: 'https://old', runAt: 1, status: ISimulationStatus.FAILED })
    })

    it('answers 503 and saves nothing when the freshness read fails', async () => {
      const proposal = await seed()
      const inputHash = TenderlyProposal.inputHash(proposal)
      sandbox.stub(Models.Proposal, 'findByEntityId').rejects(new Error('down'))

      const thrown: any = await TenderlyProposal.save(id, inputHash, result()).catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      sandbox.restore()
      const stored = (await Models.Proposal.findByEntityId(id))!
      expect(stored.simulation?.runAt ?? null).to.be.null
    })

    it('answers 503 when the write conflicts with an edit', async () => {
      sandbox.stub(DbTx, 'executeTxFn').rejects({ code: 112, message: 'Write conflict' })

      const thrown: any = await TenderlyProposal.save(id, 'hash', result()).catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
    })

    it('keeps the completed result when the write fails for another reason', async () => {
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('down'))

      await TenderlyProposal.save(id, 'hash', result())
    })
  })
})
