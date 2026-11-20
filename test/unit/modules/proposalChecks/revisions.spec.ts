import Revisions from '@modules/proposalChecks/revisions'
import { type IAssessmentEventLocation, type IAssessmentRequestInput, NetworksEnum } from '@types'
import { expect } from 'chai'

const transfer = { to: '0xAbC0000000000000000000000000000000000001', value: '0', data: '0xA9059CBB00' }
const mint = { to: '0xAbC0000000000000000000000000000000000002', value: '1', data: '0x40c10f1900' }
const event: IAssessmentEventLocation = {
  blockNumber: 100,
  blockHash: '0xBLOCK',
  transactionHash: '0xTX',
  logIndex: 3,
}

const input: IAssessmentRequestInput = {
  proposal: {
    id: 'p1',
    network: NetworksEnum.polygonMainnet,
    daoAddress: '0xDDfa944A93ec63c73dF500d282D0c2De741aD752',
    pluginAddress: '0xB27E674De511A987082d7c96f44f2A93BDBda5A7',
    rawActions: [transfer, mint],
    allowFailureMap: '0',
    metadataUri: 'ipfs://Qm1',
    settings: { minDuration: 3600 },
  },
  event,
  causeId: Revisions.causeIdForEvent('created', event),
  evidenceBlock: { number: 100, hash: '0xBLOCK', time: 1 },
}

describe('proposalChecks/revisions', () => {
  it('hashes the same actions to the same value regardless of hex case or key order', () => {
    const a = Revisions.actionsHash([transfer, mint], '0')
    const b = Revisions.actionsHash(
      [
        { data: transfer.data.toLowerCase(), value: transfer.value, to: transfer.to.toLowerCase() },
        { data: mint.data, to: mint.to, value: mint.value },
      ],
      '0',
    )
    expect(a).to.eq(b)
    expect(a).to.match(/^0x[0-9a-f]{64}$/)
  })

  it('changes the actions hash when the order, a byte, a value or the failure map changes', () => {
    const base = Revisions.actionsHash([transfer, mint], '0')
    expect(Revisions.actionsHash([mint, transfer], '0')).to.not.eq(base)
    expect(Revisions.actionsHash([{ ...transfer, data: '0xA9059CBB01' }, mint], '0')).to.not.eq(base)
    expect(Revisions.actionsHash([{ ...transfer, value: '1' }, mint], '0')).to.not.eq(base)
    expect(Revisions.actionsHash([transfer, mint], '1')).to.not.eq(base)
  })

  it('keeps a failure map above 2^53 exact because it is hashed as a string', () => {
    const exact = Revisions.actionsHash([transfer], '9007199254740993')
    const rounded = Revisions.actionsHash([transfer], String(Number(9007199254740993n)))
    expect(exact).to.not.eq(rounded)
  })

  it('treats an empty action list as a valid revision', () => {
    expect(Revisions.actionsHash([], '0')).to.not.eq(Revisions.actionsHash([transfer], '0'))
  })

  it('gives a new revision id when the metadata, settings, source event or block differ', () => {
    const base = {
      proposalId: 'p1',
      event,
      actionsHash: Revisions.actionsHash([transfer], '0'),
      metadataUri: 'ipfs://Qm1',
      storedSettings: { a: 1 },
    }
    const id = Revisions.revisionId(base)
    expect(Revisions.revisionId({ ...base, metadataUri: 'ipfs://Qm2' })).to.not.eq(id)
    expect(Revisions.revisionId({ ...base, storedSettings: { a: 2 } })).to.not.eq(id)
    expect(Revisions.revisionId({ ...base, event: { ...event, logIndex: 4 } })).to.not.eq(id)
    expect(Revisions.revisionId({ ...base, event: { ...event, blockHash: '0xOTHERBLOCK' } })).to.not.eq(id)
    expect(Revisions.revisionId({ ...base, event: { ...event, blockNumber: 101 } })).to.not.eq(id)
    expect(Revisions.revisionId({ ...base, event: { ...event, transactionHash: '0xtx', blockHash: '0xblock' } })).to.eq(
      id,
    )
  })

  it('gives a new request id per cause and per rules version', () => {
    const base = { proposalId: 'p1', revisionId: 'r1', causeId: 'created:0xtx:3', rulesVersion: 1 }
    const id = Revisions.requestId(base)
    expect(Revisions.requestId(base)).to.eq(id)
    expect(Revisions.requestId({ ...base, causeId: 'permissions:0xother:0' })).to.not.eq(id)
    expect(Revisions.requestId({ ...base, rulesVersion: 2 })).to.not.eq(id)
  })

  it('builds a cause id from the event kind and its exact location', () => {
    expect(Revisions.causeIdForEvent('created', event)).to.eq('created:0xtx:3')
    expect(Revisions.causeIdForEvent('edited', { ...event, logIndex: 0 })).to.eq('edited:0xtx:0')
  })

  it('derives all three ids from one request input', () => {
    const ids = Revisions.revisionOf(input, 1)
    expect(ids.actionsHash).to.eq(Revisions.actionsHash(input.proposal.rawActions, '0'))
    expect(ids.revisionId).to.eq(
      Revisions.revisionId({
        proposalId: 'p1',
        event,
        actionsHash: ids.actionsHash,
        metadataUri: 'ipfs://Qm1',
        storedSettings: { minDuration: 3600 },
      }),
    )
    expect(ids.requestId).to.eq(
      Revisions.requestId({ proposalId: 'p1', revisionId: ids.revisionId, causeId: input.causeId, rulesVersion: 1 }),
    )
  })
})
