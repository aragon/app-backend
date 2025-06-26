import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteRouter from '@api/routers/v2/vote'
import VoteController from '@api/controllers/vote'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('RouterV2: Vote', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get vote with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', // Maps to memberAddress
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        tokenAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        includeInfo: 'true',
        highlightUser: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: '10',
        page: '1',
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'blockNumber',
      }

      const pairParams = {
        daoId: undefined,
        ens: undefined,
        proposalId: undefined,
      }

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        memberAddress: getAddress(filterParams.address), // address -> memberAddress
        daoAddress: getAddress(filterParams.daoAddress),
        pluginAddress: getAddress(filterParams.pluginAddress),
        tokenAddress: getAddress(filterParams.tokenAddress),
        includeInfo: true,
        highlightUser: getAddress(filterParams.highlightUser),
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq(pairParams)
    })

    it('Should get vote with pagination - ens', async () => {
      const filterParams = {
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
        ens: 'test.dao.eth',
      }
      const paginationParams = {
        pageSize: '10',
        page: '1',
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'blockNumber',
      }

      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        pageSize: 10,
        page: 1,
        order: 'asc',
        ...missingParams,
      })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
        highlightUser: undefined,
        pluginAddress: undefined,
        memberAddress: undefined,
        tokenAddress: undefined,
        includeInfo: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({
        daoId: undefined,
        ens: filterParams.ens,
        proposalId: undefined,
      })
    })

    it('Should get vote with pagination - proposalId', async () => {
      const filterParams = {
        daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
        proposalId: 'proposal-123',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: filterParams,
      }

      await VoteRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({
        daoId: undefined,
        ens: undefined,
        proposalId: filterParams.proposalId,
      })
    })

    it('Should get vote with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await VoteRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'createdAt',
        order: 'desc',
        page: 1,
        pageSize: 10,
      }
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        memberAddress: getAddress(filterParams.address),
        daoAddress: undefined,
        pluginAddress: undefined,
        tokenAddress: undefined,
        network: filterParams.network,
        includeInfo: undefined,
        highlightUser: undefined,
      })
      expect(stubCtrl.args[0]?.[2]).to.deep.eq({
        daoId: undefined,
        ens: undefined,
        proposalId: undefined,
      })
    })

    it('Should fail validation when neither daoId nor network with address is provided', async () => {
      const ctx: any = {
        query: {
          includeInfo: 'true',
        },
      }

      let error: any
      try {
        await VoteRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should fail validation when network is provided without any address', async () => {
      const ctx: any = {
        query: {
          network: NetworksEnum.ethereumMainnet,
          includeInfo: 'false',
        },
      }

      let error: any
      try {
        await VoteRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include(
        'Either daoId must be provided, or network with at least one address field',
      )
    })

    it('Should handle lowercase addresses and checksum them', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        daoAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        pluginAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        tokenAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        highlightUser: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
      }

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination').returns(true as any)

      const ctx: any = {
        query: filterParams,
      }

      await VoteRouter.getWithPagination(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[1]).to.deep.eq({
        network: filterParams.network,
        memberAddress: getAddress(filterParams.address),
        daoAddress: getAddress(filterParams.daoAddress),
        pluginAddress: getAddress(filterParams.pluginAddress),
        tokenAddress: getAddress(filterParams.tokenAddress),
        includeInfo: undefined,
        highlightUser: getAddress(filterParams.highlightUser),
      })
    })

    it('Should handle includeInfo boolean values', async () => {
      const testCases = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: '1', expected: false },
        { input: '0', expected: false },
        { input: 'yes', expected: false },
        { input: 'no', expected: false },
        { input: 'invalid', expected: false },
      ]

      const stubCtrl = sandbox.stub(VoteController, 'getVoteWithPagination')

      for (const testCase of testCases) {
        stubCtrl.reset()
        stubCtrl.returns(true as any)

        const ctx: any = {
          query: {
            network: NetworksEnum.ethereumMainnet,
            address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
            includeInfo: testCase.input,
          },
        }

        await VoteRouter.getWithPagination(ctx)

        console.log(stubCtrl.args[0]?.[1]?.includeInfo)
        expect(stubCtrl.args[0]?.[1]?.includeInfo).to.equal(testCase.expected)
      }
    })

    it('Should allow address parameter in query (skipParams)', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        extraParam: 'should-fail', // This should fail validation
      }

      const ctx: any = {
        query: filterParams,
      }

      let error: any
      try {
        await VoteRouter.getWithPagination(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      // The error should be about extraParam, not address (which is skipped)
      expect(error.exposeMeta.validationError.errors[0]).to.include('"value" must have less than or equal')
    })
  })

  describe('getMemberVoteInfo', () => {
    it('Should get member vote info', async () => {
      const queryParams = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(VoteController, 'memberVotesInfo').resolves({
        voted: true,
        vote: 'YES',
        votingPower: 1000,
      } as any)

      const ctx: any = {
        query: queryParams,
      }

      await VoteRouter.getMemberVoteInfo(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        memberAddress: getAddress(queryParams.memberAddress),
        pluginAddress: getAddress(queryParams.pluginAddress),
        proposalIndex: queryParams.proposalIndex,
        network: queryParams.network,
      })
      expect(ctx.body).to.deep.eq({
        voted: true,
        vote: 'YES',
        votingPower: 1000,
      })
    })

    it('Should handle lowercase addresses and checksum them', async () => {
      const queryParams = {
        memberAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        pluginAddress: '0x0eb63a3565942d16c1c1211bd78f1b3dcfe1a254',
        proposalIndex: '42',
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(VoteController, 'memberVotesInfo').resolves({
        voted: false,
      } as any)

      const ctx: any = {
        query: queryParams,
      }

      await VoteRouter.getMemberVoteInfo(ctx)

      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        memberAddress: getAddress(queryParams.memberAddress),
        pluginAddress: getAddress(queryParams.pluginAddress),
        proposalIndex: queryParams.proposalIndex,
        network: queryParams.network,
      })
    })

    it('Should fail validation when memberAddress is missing', async () => {
      const queryParams = {
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"memberAddress" is required')
    })

    it('Should fail validation when pluginAddress is missing', async () => {
      const queryParams = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"pluginAddress" is required')
    })

    it('Should fail validation when proposalIndex is missing', async () => {
      const queryParams = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"proposalIndex" is required')
    })

    it('Should fail validation when network is missing', async () => {
      const queryParams = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        proposalIndex: '1',
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })

    it('Should fail validation when memberAddress is invalid', async () => {
      const queryParams = {
        memberAddress: '0xinvalid',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"memberAddress" is not a valid address')
    })

    it('Should fail validation when network is invalid', async () => {
      const queryParams = {
        memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        proposalIndex: '1',
        network: 'invalid-network',
      }

      const ctx: any = {
        query: queryParams,
      }

      let error: any
      try {
        await VoteRouter.getMemberVoteInfo(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('Should handle different proposalIndex values', async () => {
      const proposalIndexes = ['0', '1', '100', '999999']

      const stubCtrl = sandbox.stub(VoteController, 'memberVotesInfo')

      for (const proposalIndex of proposalIndexes) {
        stubCtrl.reset()
        stubCtrl.resolves({ voted: true, proposalIndex } as any)

        const ctx: any = {
          query: {
            memberAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
            proposalIndex,
            network: NetworksEnum.ethereumMainnet,
          },
        }

        await VoteRouter.getMemberVoteInfo(ctx)

        expect(stubCtrl.args[0]?.[0].proposalIndex).to.equal(proposalIndex)
        expect(ctx.body).to.deep.eq({ voted: true, proposalIndex })
      }
    })
  })
})
