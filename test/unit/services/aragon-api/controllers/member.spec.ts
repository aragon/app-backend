import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Member from '@models/schema/member'
import PairDataModule from '@modules/pairData'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: undefined,
      history: [
        {
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
          pluginSubdomain: 'token-voting',
          tokenBalance: '100',
          metrics: {
            delegateReceivedCount: 0,
            delegateSentCount: 0,
            voteCount: 0,
            proposalCount: 0,
          },
          fromBlockTimestamp: 0,
        },
      ],
    }

    await Models.Member.create(rawMember)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getMembersWithPagination', () => {
    it('should get members with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawMember.history?.[0].network,
        daoAddress: rawMember.history?.[0].daoAddress,
        pluginAddress: rawMember.history?.[0].pluginAddress,
        tokenAddress: rawMember.history?.[0].tokenAddress,
      }

      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(null)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(null)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawMember.history?.[0].network}-${rawMember.history?.[0].daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawMember.history?.[0].daoAddress,
        network: rawMember.history?.[0].network,
      })
      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawMember.history?.[0].daoAddress,
            network: rawMember.history?.[0].network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(null)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawMember.history?.[0].network}-${rawMember.history?.[0].daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  // describe('getActiveMembersWithPagination', () => {
  //   it('should get active members with pagination - all params', async () => {
  //     const member = await Models.Member.create({
  //       address: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
  //       ens: undefined,
  //       history: [
  //         {
  //           daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           network: NetworksEnum.ethereumMainnet,
  //           pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           fromBlockNumber: 1,
  //           toBlockNumber: undefined as any,
  //           fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
  //           toTxHash: undefined as any,
  //           delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           votingPower: '100',
  //           pluginSubdomain: 'token-voting',
  //         },
  //       ] as any,
  //     })
  //
  //     const paginationParams = {
  //       search: '',
  //       pageSize: 10,
  //       page: 1,
  //       order: 'asc',
  //       sort: 'createdAt',
  //     }
  //
  //     const filterParams: any = {
  //       network: member.history?.[0].network,
  //       daoAddress: member.history?.[0].daoAddress,
  //       pluginAddress: member.history?.[0].pluginAddress,
  //       tokenAddress: member.history?.[0].tokenAddress,
  //     }
  //
  //     const spyReq = sandbox.spy(Models.Member, 'findActiveWithPagination')
  //
  //     const response = await MemberController.getMemberByAddress("xxx", {}, filterParams)
  //
  //     expect(spyReq.calledOnce).to.be.true
  //     expect(
  //       spyReq.calledWith({
  //         extraParams: filterParams,
  //         paginationParams: {
  //           search: '',
  //           pageSize: 10,
  //           page: 1,
  //           order: 'asc',
  //           sort: 'createdAt',
  //         },
  //       }),
  //     ).to.be.true
  //
  //     expect(response).to.have.property('data').with.lengthOf(1)
  //     // expect(response.data[0].address).to.eq(member.address)
  //     // expect(response.data[0].ens).to.eq(member.ens)
  //     // expect(response.metadata.page).to.eq(1)
  //     // expect(response.metadata.totalPages).to.eq(1)
  //     // expect(response.metadata.totalRecords).to.eq(1)
  //   })
  //
  //   it('should get active members no params', async () => {
  //     const member = await Models.Member.create({
  //       address: '0x17366cae2b9c6c3055e9e0c78936a69006be5000',
  //       ens: undefined,
  //       history: [
  //         {
  //           daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           network: NetworksEnum.ethereumMainnet,
  //           pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           fromBlockNumber: 1,
  //           toBlockNumber: undefined as any,
  //           fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
  //           toTxHash: undefined as any,
  //           delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           votingPower: '100',
  //           pluginSubdomain: 'token-voting',
  //         },
  //       ] as any,
  //     })
  //
  //     const paginationParams = {
  //       search: '',
  //       pageSize: 10,
  //       page: 1,
  //       order: 'asc',
  //       sort: 'createdAt',
  //     }
  //
  //     const filterParams: any = {}
  //
  //     const spyReq = sandbox.spy(Models.Member, 'findActiveWithPagination')
  //
  //     const response = await MemberController.getActiveMembersWithPagination(paginationParams, filterParams)
  //
  //     expect(spyReq.calledOnce).to.be.true
  //     expect(
  //       spyReq.calledWith({
  //         extraParams: filterParams,
  //         paginationParams: {
  //           search: '',
  //           pageSize: 10,
  //           page: 1,
  //           order: 'asc',
  //           sort: 'createdAt',
  //         },
  //       }),
  //     ).to.be.true
  //
  //     expect(response).to.have.property('data').with.lengthOf(1)
  //     expect(response.data[0].address).to.eq(member.address)
  //     expect(response.data[0].ens).to.eq(member.ens)
  //     expect(response.metadata.page).to.eq(1)
  //     expect(response.metadata.totalPages).to.eq(1)
  //     expect(response.metadata.totalRecords).to.eq(1)
  //   })
  //
  //   it('should get active members with pagination - daoId', async () => {
  //     const member = await Models.Member.create({
  //       address: '0x17366cae2b9c6c3055e9e3c78936a69006be3309',
  //       ens: undefined,
  //       history: [
  //         {
  //           daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           network: NetworksEnum.ethereumMainnet,
  //           pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           fromBlockNumber: 1,
  //           toBlockNumber: undefined as any,
  //           fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
  //           toTxHash: undefined as any,
  //           delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           votingPower: '100',
  //           pluginSubdomain: 'token-voting',
  //         },
  //       ] as any,
  //     })
  //
  //     const paginationParams = {
  //       search: '',
  //       pageSize: 10,
  //       page: 1,
  //       order: 'asc',
  //       sort: 'createdAt',
  //     }
  //
  //     const filterParams: any = {}
  //     const pairParams: any = {
  //       daoId: `${member.history?.[0].network}-${member.history?.[0].daoAddress}`,
  //     }
  //     sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
  //       daoAddress: member.history?.[0].daoAddress,
  //       network: member.history?.[0].network,
  //     })
  //     const spyReq = sandbox.spy(Models.Member, 'findActiveWithPagination')
  //
  //     const response = await MemberController.getActiveMembersWithPagination(paginationParams, filterParams, pairParams)
  //
  //     expect(spyReq.calledOnce).to.be.true
  //     expect(
  //       spyReq.calledWith({
  //         extraParams: {
  //           daoAddress: member.history?.[0].daoAddress,
  //           network: member.history?.[0].network,
  //         },
  //         paginationParams: {
  //           search: '',
  //           pageSize: 10,
  //           page: 1,
  //           order: 'asc',
  //           sort: 'createdAt',
  //         },
  //       }),
  //     ).to.be.true
  //
  //     expect(response).to.have.property('data').with.lengthOf(1)
  //     expect(response.data[0].address).to.eq(member.address)
  //     expect(response.data[0].ens).to.eq(member.ens)
  //     expect(response.metadata.page).to.eq(1)
  //     expect(response.metadata.totalPages).to.eq(1)
  //     expect(response.metadata.totalRecords).to.eq(1)
  //   })
  //
  //   it('should get active members with pagination - daoId not found', async () => {
  //     const paginationParams = {
  //       search: '',
  //       pageSize: 10,
  //       page: 1,
  //       order: 'asc',
  //       sort: 'createdAt',
  //     }
  //
  //     const filterParams: any = {}
  //     const pairParams: any = {
  //       daoId: `${rawMember.history?.[0].network}-${rawMember.history?.[0].daoAddress}`,
  //     }
  //     sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
  //     const spyReq = sandbox.spy(Models.Member, 'findActiveWithPagination')
  //
  //     const response = await MemberController.getActiveMembersWithPagination(paginationParams, filterParams, pairParams)
  //
  //     expect(spyReq.calledOnce).to.be.true
  //     expect(response).to.have.property('data').with.lengthOf(0)
  //   })
  // })

  describe('getMemberByAddress', () => {
    it('should getMemberByAddress', async () => {
      const memberDb = await Models.Member.create({
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
        ens: undefined,
        history: [
          {
            daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
            network: NetworksEnum.ethereumMainnet,
            pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
            tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
            fromBlockNumber: 1,
            toBlockNumber: 2,
            fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
            toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
            delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
            delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
            votingPower: '100',
            pluginSubdomain: 'token-voting',
          },
        ] as any,
      })

      const member = await MemberController.getMemberByAddress(memberDb.address)
      expect((member as any).history.length).to.eq(1)
    })

    it('should fail to getMemberByAddress', async () => {
      sandbox.stub(Models.Member, 'findMemberByAddress').resolves(null)
      const memberId = 'fake-address'
      await expect(MemberController.getMemberByAddress(memberId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  // describe('getActiveMemberByAddress', () => {
  //   it('should getActiveMemberByAddress with params', async () => {
  //     const memberDb = await Models.Member.create({
  //       address: '0x17368cae2b9c6c3055e9e3c78936a69006be5411',
  //       ens: 'test.eth',
  //       history: [
  //         {
  //           daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
  //           network: NetworksEnum.ethereumMainnet,
  //           pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           fromBlockNumber: 1,
  //           toBlockNumber: undefined as any,
  //           fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
  //           toTxHash: undefined as any,
  //           delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           votingPower: '100',
  //           pluginSubdomain: 'token-voting',
  //         },
  //       ] as any,
  //     })
  //
  //     const member = await MemberController.getActiveMemberByAddress(memberDb.address, {
  //       daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
  //     })
  //     expect(member.ens).to.eq(memberDb.ens)
  //     expect(member.address).to.eq(memberDb.address)
  //     expect(member.network).to.eq(memberDb.history[0].network)
  //     expect(member.fromBlockNumber).to.eq(memberDb.history[0].fromBlockNumber)
  //     expect(member.daoAddress).to.eq(memberDb.history[0].daoAddress)
  //     expect(member.tokenAddress).to.eq(memberDb.history[0].tokenAddress)
  //     expect(member.pluginAddress).to.eq(memberDb.history[0].pluginAddress)
  //     expect(member.votingPower).to.eq(memberDb.history[0].votingPower)
  //   })
  //
  //   it('should getActiveMemberByAddress', async () => {
  //     const memberDb = await Models.Member.create({
  //       address: '0x17368cae2b9c6c3055e9e3c78936a69006be5411',
  //       ens: 'test.eth',
  //       history: [
  //         {
  //           daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5401',
  //           network: NetworksEnum.ethereumMainnet,
  //           pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           tokenAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
  //           fromBlockNumber: 1,
  //           toBlockNumber: undefined as any,
  //           fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
  //           toTxHash: undefined as any,
  //           delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  //           votingPower: '100',
  //           pluginSubdomain: 'token-voting',
  //         },
  //       ] as any,
  //     })
  //
  //     const member = await MemberController.getActiveMemberByAddress(memberDb.address)
  //     expect(member.address).to.eq(memberDb.address)
  //     expect(member.ens).to.eq(memberDb.ens)
  //     expect(member.network).to.be.undefined
  //   })
  //
  //   it('should fail getActiveMemberByAddress', async () => {
  //     sandbox.stub(Models.Member, 'findActiveMember').resolves(null)
  //     const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5400'
  //     await expect(MemberController.getActiveMemberByAddress(address)).to.be.rejectedWith(ErrorKeyEnum.notFound)
  //   })
  // })
})
