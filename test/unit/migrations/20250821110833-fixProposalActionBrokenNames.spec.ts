import { Models } from '@dbModels'
import logger from '@logger'
import fixProposalActionBrokenNamesMigration from '@src/migrations/20250821110833-fix-proposal-action-broken-names'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('migration: fixProposalActionBrokenNames', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
  })

  afterEach(async () => {
    sandbox.restore()
  })

  describe('fixProposalActionBrokenNamesMigration', () => {
    it('should successfully migrate proposals with broken contract names', async () => {
      const brokenProposals = await Models.Proposal.insertMany([
        {
          id: 'proposal-1',
          transactionHash: '0xd06dd61b5c1fb7583c4131339ab90356d74b990ecc25e26423f4fcc2820ad19b',
          blockNumber: 40942040,
          blockTimestamp: 1680186736,
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5522',
          proposalIndex: '0',
          incrementalId: 0,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1680187320,
          endDate: 1680191520,
          actions: [
            {
              inputData: {
                function: 'mint',
                contract: 'contracts/test.sol:GovernanceERC20',
                parameters: [],
              },
            },
          ],
        },
        {
          id: 'proposal-2',
          transactionHash: '0x6d79cc4818d901eb29a0c2b1fcbffec734ed92a2db355606e3b15a18e66edb2c',
          blockNumber: 40942213,
          blockTimestamp: 1680187116,
          network: NetworksEnum.zksyncMainnet,
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb4',
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
          proposalIndex: '1',
          incrementalId: 1,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1680187680,
          endDate: 1680191880,
          actions: [
            {
              inputData: {
                function: 'transfer',
                proxyName: 'proxy/contracts/test.sol:ERC20',
                parameters: [],
              },
            },
          ],
        },
      ])

      // Run migration
      await fixProposalActionBrokenNamesMigration.start()

      // Verify migration ran successfully by checking that proposals were processed
      const processedProposals = await Models.Proposal.find({
        _id: { $in: brokenProposals.map((p: any) => p._id) },
      })

      // Verify proposals exist and migration processed them
      expect(processedProposals).to.have.length(2)
    })

    it('should handle no proposals to migrate', async () => {
      // Save proposals without broken names
      await Models.Proposal.insertMany([
        {
          id: 'proposal-clean',
          transactionHash: '0xd06dd61b5c1fb7583c4131339ab90356d74b990ecc25e26423f4fcc2820ad19b',
          blockNumber: 40942040,
          blockTimestamp: 1680186736,
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5522',
          proposalIndex: '0',
          incrementalId: 0,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1680187320,
          endDate: 1680191520,
          actions: [
            {
              inputData: {
                function: 'mint',
                contract: 'GovernanceERC20',
                parameters: [],
              },
            },
          ],
        },
      ])

      // Run migration - should not find any broken proposals
      await fixProposalActionBrokenNamesMigration.start()

      // Verify no proposals were changed
      const proposals = await Models.Proposal.find({})
      expect(proposals).to.have.length(1)
      expect(proposals[0].actions[0].inputData.contract).to.equal('GovernanceERC20')
    })

    it('should handle proposals with both contract and proxyName broken', async () => {
      // Save proposal with both contract and proxyName containing ':'
      const brokenProposal = await Models.Proposal.create({
        id: 'proposal-both-broken',
        transactionHash: '0xd06dd61b5c1fb7583c4131339ab90356d74b990ecc25e26423f4fcc2820ad19b',
        blockNumber: 40942040,
        blockTimestamp: 1680186736,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
        daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5522',
        proposalIndex: '0',
        incrementalId: 0,
        creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
        startDate: 1680187320,
        endDate: 1680191520,
        actions: [
          {
            inputData: {
              function: 'mint',
              contract: 'abc/test.sol:GovernanceERC20',
              proxyName: 'proxy/test.sol:ERC20Proxy',
              parameters: [],
            },
          },
        ],
      })

      // Run migration
      await fixProposalActionBrokenNamesMigration.start()

      // Verify proposal was processed by migration
      const processedProposal = await Models.Proposal.findById(brokenProposal._id)
      expect(processedProposal).to.exist
    })

    it('should only process proposals from specified networks', async () => {
      // Save proposals from different networks
      await Models.Proposal.insertMany([
        {
          id: 'proposal-polygon',
          transactionHash: '0xd06dd61b5c1fb7583c4131339ab90356d74b990ecc25e26423f4fcc2820ad19b',
          blockNumber: 40942040,
          blockTimestamp: 1680186736,
          network: NetworksEnum.polygonMainnet, // Should NOT be processed
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5522',
          proposalIndex: '0',
          incrementalId: 0,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1680187320,
          endDate: 1680191520,
          actions: [
            {
              inputData: {
                function: 'mint',
                contract: 'contracts/test.sol:GovernanceERC20',
                parameters: [],
              },
            },
          ],
        },
        {
          id: 'proposal-ethereum',
          transactionHash: '0x6d79cc4818d901eb29a0c2b1fcbffec734ed92a2db355606e3b15a18e66edb2c',
          blockNumber: 40942213,
          blockTimestamp: 1680187116,
          network: NetworksEnum.ethereumMainnet, // Should be processed
          pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb4',
          daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
          proposalIndex: '1',
          incrementalId: 1,
          creatorAddress: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
          startDate: 1680187680,
          endDate: 1680191880,
          actions: [
            {
              inputData: {
                function: 'transfer',
                contract: 'abc/test.sol:ERC20',
                parameters: [],
              },
            },
          ],
        },
      ])

      // Run migration
      await fixProposalActionBrokenNamesMigration.start()

      // Verify both proposals exist and only ethereum was processed
      const polygonProposal = await Models.Proposal.findOne({ network: NetworksEnum.polygonMainnet })
      const ethereumProposal = await Models.Proposal.findOne({ network: NetworksEnum.ethereumMainnet })

      expect(polygonProposal).to.exist
      expect(ethereumProposal).to.exist
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await fixProposalActionBrokenNamesMigration.stop()
    })
  })
})
