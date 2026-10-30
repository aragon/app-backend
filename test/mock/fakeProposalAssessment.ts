import { type HexAddress, IAssessmentRequestStatus, NetworksEnum, PROPOSAL_CHECKS_RULES_VERSION } from '@types'

/** A pending request as slice 1a-2 will insert it: captured revision, no result yet. */
export const fakeProposalAssessment = (overrides: Record<string, unknown> = {}) => ({
  id: 'req:0xproposal:rev1:created:0xtx:0:1',
  proposalId: '0xtx-0xB27E674De511A987082d7c96f44f2A93BDBda5A7-1',
  network: NetworksEnum.polygonMainnet,
  daoAddress: '0xDDfa944A93ec63c73dF500d282D0c2De741aD752' as HexAddress,
  pluginAddress: '0xB27E674De511A987082d7c96f44f2A93BDBda5A7' as HexAddress,
  revisionId: 'rev1',
  causeId: 'created:0xtx:0',
  generation: 1,
  rulesVersion: PROPOSAL_CHECKS_RULES_VERSION,
  status: IAssessmentRequestStatus.Pending,
  captured: {
    rawActions: [{ to: '0x0000000000000000000000000000000000000001', value: '0', data: '0x' }],
    allowFailureMap: '0',
    metadataUri: 'ipfs://QmFake',
    storedSettings: null,
    evidenceBlock: {
      number: 90094457,
      hash: '0x037797494304af671076afb8c807aa5fcc84a4324201d8c0f765fac274447bf7',
      time: 1783846681,
    },
  },
  ...overrides,
})

/** The proposal and plugin a request belongs to, as the indexer would have written them before the request. */
export const seedRequestOwners = async (request: {
  proposalId: string
  pluginAddress: string
  daoAddress: string
  network: NetworksEnum
}) => {
  const { Models } = await import('@dbModels')
  const { PluginList } = await import('@test/mock/fakePlugins')
  const { ProposalList } = await import('@test/mock/fakeProposal')
  const strip = (doc: Record<string, unknown>) => {
    const { _id, __v, createdAt, updatedAt, id, ...rest } = doc
    return rest
  }
  if (!(await Models.Plugin.findOne({ address: request.pluginAddress, network: request.network }))) {
    await Models.Plugin.create({
      ...strip(PluginList[0] as any),
      address: request.pluginAddress,
      network: request.network,
      daoAddress: request.daoAddress,
    } as any)
  }
  if (!(await Models.Proposal.findOne({ id: request.proposalId }))) {
    await Models.Proposal.create({
      ...strip(ProposalList[0] as any),
      id: request.proposalId,
      pluginAddress: request.pluginAddress,
      daoAddress: request.daoAddress,
      network: request.network,
      proposalIndex: request.proposalId.split('-').pop() ?? '0',
    } as any)
  }
}
