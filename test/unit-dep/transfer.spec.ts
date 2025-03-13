// import * as sinon from 'sinon'
// import { SinonSandbox } from 'sinon'
// import { expect } from 'chai'
// import {IEventLogMember, IGovernanceErc20Logs, ITransferSide, NetworksEnum} from '@types'
// import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
// import { Models } from '@dbModels'
// import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
// import UnitDepUtils from '@test/lib/unit-dep/utils'
//
// describe('Integ: Transfer', () => {
//   let sandbox: SinonSandbox
//
//   beforeEach(() => {
//     sandbox = sinon.createSandbox()
//   })
//
//   afterEach(() => {
//     sandbox && sandbox.restore()
//   })
//
//   it('should test transfer on token with isGovernance true and hasDelegate to false', async function () {
//     this.timeout(1600000) // Increase timeout for the test
//
//     const network = NetworksEnum.ethereumSepolia
//     const daoAddress = '0x6bbddf7D7fcBd53adeffD099d65550b6b035A482'
//     const pluginAddress = '0xc57fd38C99Ed5C2A4418658898d1C130cb611803'
//     const tokenAddress = '0x01403157c847B2c0291c05DF5055876eB4e039bc'
//     const member1 = '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759'
//
//     // create plugin
//     await Models.Plugin.create({
//       transactionHash: '0xf404f5c73a3592dc263b3bcb24e268b89eac525f466b6bd1fa9699b2bc3feff2',
//       blockNumber: 7712860,
//       blockTimestamp: 1739622120,
//       network,
//       address: '0xc57fd38C99Ed5C2A4418658898d1C130cb611803',
//       implementationAddress: '0xBa420350B53d2f3e58BF1D0b41Cec7261f87A33d',
//       interfaceType: 'tokenVoting',
//       status: 'installed',
//       isSupported: true,
//       daoAddress,
//       tokenAddress,
//       pluginSetupRepoAddress: '0x6241ad0D3f162028d2e0000f1A878DBc4F5c4aD0',
//       sender: '0x6bbddf7D7fcBd53adeffD099d65550b6b035A482',
//       release: '1',
//       build: '5',
//       subdomain: 'token-voting',
//       permissions: [],
//       uninstalled: {
//         status: false,
//         transactionHash: null,
//         blockNumber: null,
//         blockTimestamp: null,
//       },
//       isProcess: true,
//       isBody: true,
//       isSubPlugin: true,
//       metadataIpfs: null,
//       name: null,
//       description: null,
//       processKey: null,
//       subPlugins: [],
//       links: [],
//     })
//
//     const tx1 = await UnitDepUtils.getData(
//       GovernanceERC20.abi,
//       IGovernanceErc20Logs.Transfer,
//       '0x905d31bba496a96b1c1e63ab70a2462d13b1f1345c7c25cb0b0265631fb3e47a',
//       network,
//     )
//
//     for (const { event, logInfo } of tx1) {
//       await GovernanceErc20Handler.transfer(event, logInfo)
//     }
//
//     console.log('ok')
//
//
//
//
//
//
//     // // test member created
//     // expect(await Models.Member.findByAddress(member1)).to.exist
//     // expect(await Models.Member.findByAddress(member2)).to.exist
//     //
//     // // test member1 have a transaction, balance and correct metrics
//     // let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
//     // let member1Balance = await Models.MemberBalance.findOne({ address: member1 })
//     // let member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })
//     //
//     // expect(member1Txs).to.have.length(1)
//     // expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
//     // expect(member1Txs[0].from).to.eq(member2)
//     // expect(member1Txs[0].to).to.eq(member1)
//     // expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
//     // expect(member1Balance.votingPower).to.eq('2000000000000000000')
//     // expect(member1Balance.amount).to.eq('0')
//     // expect(member1Metrics.delegateReceivedCount).to.eq(1)
//     // expect(member1Metrics.delegateSentCount).to.eq(0)
//     //
//     // // test member2 have a transaction, balance and correct metrics
//     // let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
//     // let member2Balance = await Models.MemberBalance.findOne({ address: member2 })
//     // let member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })
//     //
//     // expect(member2Txs).to.have.length(1)
//     // expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
//     // expect(member2Txs[0].from).to.eq(member2)
//     // expect(member2Txs[0].to).to.eq(member1)
//     // expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member2Txs[0].memberVotingPower).to.eq('0')
//     // expect(member2Balance.votingPower).to.eq('0')
//     // expect(member2Balance.amount).to.eq('0')
//     // expect(member2Metrics.delegateReceivedCount).to.eq(0)
//     // expect(member2Metrics.delegateSentCount).to.eq(1)
//     //
//     // console.log('end tx1')
//     //
//     // // member3 delegate to member1 1 token
//     // // member1 prev balance 2000000000000000000 new balance 3000000000000000000
//     // // member3 prev balance 1000000000000000000 new balance 0
//     // const tx2 = await UnitDepUtils.getData(
//     //   GovernanceERC20.abi,
//     //   IEventLogMember.DelegateVotesChanged,
//     //   '0x1127fa7b1df29f6dbcbdd5d385f8c0eda48e73ad2ed808d1eb5dffb053053a76',
//     //   network,
//     // )
//     //
//     // for (const { event, logInfo } of tx2) {
//     //   await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
//     // }
//     //
//     // // test member created
//     // expect(await Models.Member.findByAddress(member3)).to.exist
//     //
//     // // test member1 have a transaction, balance and correct metrics
//     // member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
//     // member1Balance = await Models.MemberBalance.findOne({ address: member1 })
//     // member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })
//     //
//     // expect(member1Txs).to.have.length(2)
//     // expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
//     // expect(member1Txs[0].from).to.eq(member3)
//     // expect(member1Txs[0].to).to.eq(member1)
//     // expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
//     // expect(member1Balance.votingPower).to.eq('3000000000000000000')
//     // expect(member1Balance.amount).to.eq('0')
//     // expect(member1Metrics.delegateReceivedCount).to.eq(2)
//     // expect(member1Metrics.delegateSentCount).to.eq(0)
//     //
//     // // test member3 have a transaction, balance and correct metrics
//     // let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
//     // let member3Balance = await Models.MemberBalance.findOne({ address: member3 })
//     // let member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })
//     //
//     // expect(member3Txs).to.have.length(1)
//     // expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
//     // expect(member3Txs[0].from).to.eq(member3)
//     // expect(member3Txs[0].to).to.eq(member1)
//     // expect(member3Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member3Txs[0].memberVotingPower).to.eq('0')
//     // expect(member3Balance.votingPower).to.eq('0')
//     // expect(member3Balance.amount).to.eq('0')
//     // expect(member3Metrics.delegateReceivedCount).to.eq(0)
//     // expect(member3Metrics.delegateSentCount).to.eq(1)
//     //
//     // console.log('end tx2')
//     //
//     // // member4 delegate to member1 1 token
//     // // member1 prev balance 3000000000000000000 new balance 4000000000000000000
//     // // member4 prev balance 1000000000000000000 new balance 0
//     // const tx3 = await UnitDepUtils.getData(
//     //   GovernanceERC20.abi,
//     //   IEventLogMember.DelegateVotesChanged,
//     //   '0xf703823a43620c92eedf5100c8f0e47d1a1e960c4c3d14abf8353aab7b5d443d',
//     //   network,
//     // )
//     //
//     // for (const { event, logInfo } of tx3) {
//     //   await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
//     // }
//     //
//     // // test member created
//     // expect(await Models.Member.findByAddress(member4)).to.exist
//     //
//     // // test member1 have a transaction, balance and correct metrics
//     // member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
//     // member1Balance = await Models.MemberBalance.findOne({ address: member1 })
//     // member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })
//     //
//     // expect(member1Txs).to.have.length(3)
//     // expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
//     // expect(member1Txs[0].from).to.eq(member4)
//     // expect(member1Txs[0].to).to.eq(member1)
//     // expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member1Txs[0].memberVotingPower).to.eq('4000000000000000000')
//     // expect(member1Balance.votingPower).to.eq('4000000000000000000')
//     // expect(member1Balance.amount).to.eq('0')
//     // expect(member1Metrics.delegateReceivedCount).to.eq(3)
//     // expect(member1Metrics.delegateSentCount).to.eq(0)
//     //
//     // // test member4 have a transaction, balance and correct metrics
//     // let member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
//     // let member4Balance = await Models.MemberBalance.findOne({ address: member4 })
//     // let member4Metrics = await Models.MemberMetrics.findOne({ address: member4 })
//     //
//     // expect(member4Txs).to.have.length(1)
//     // expect(member4Txs[0].side).to.eq(ITransferSide.outgoing)
//     // expect(member4Txs[0].from).to.eq(member4)
//     // expect(member4Txs[0].to).to.eq(member1)
//     // expect(member4Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member4Txs[0].memberVotingPower).to.eq('0')
//     // expect(member4Balance.votingPower).to.eq('0')
//     // expect(member4Balance.amount).to.eq('0')
//     // expect(member4Metrics.delegateReceivedCount).to.eq(0)
//     // expect(member4Metrics.delegateSentCount).to.eq(1)
//     //
//     // console.log('end tx3')
//     //
//     // // Revoking delegation
//     // // member1 delegate to member2 1 token
//     // // member1 prev balance 4000000000000000000 new balance 3000000000000000000
//     // // member2 prev balance 0 new balance 1000000000000000000
//     // const tx4 = await UnitDepUtils.getData(
//     //   GovernanceERC20.abi,
//     //   IEventLogMember.DelegateVotesChanged,
//     //   '0x4ac08441f32f2b13dd5b3897cc1ae13bd6164e6b79699511f5923b00d801419c',
//     //   network,
//     // )
//     //
//     // for (const { event, logInfo } of tx4) {
//     //   await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
//     // }
//     //
//     // // test member1 have a transaction, balance and correct metrics
//     // member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
//     // member1Balance = await Models.MemberBalance.findOne({ address: member1 })
//     // member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })
//     //
//     // expect(member1Txs).to.have.length(4)
//     // expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
//     // expect(member1Txs[0].from).to.eq(member1)
//     // expect(member1Txs[0].to).to.eq(member2)
//     // expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
//     // expect(member1Balance.votingPower).to.eq('3000000000000000000')
//     // expect(member1Balance.amount).to.eq('0')
//     // expect(member1Metrics.delegateReceivedCount).to.eq(3)
//     // expect(member1Metrics.delegateSentCount).to.eq(1)
//     //
//     // // test member2 have a transaction, balance and correct metrics
//     // member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
//     // member2Balance = await Models.MemberBalance.findOne({ address: member2 })
//     // member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })
//     //
//     // expect(member2Txs).to.have.length(2)
//     // expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
//     // expect(member2Txs[0].from).to.eq(member1)
//     // expect(member2Txs[0].to).to.eq(member2)
//     // expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
//     // expect(member2Balance.votingPower).to.eq('1000000000000000000')
//     // expect(member2Balance.amount).to.eq('0')
//     // expect(member2Metrics.delegateReceivedCount).to.eq(1)
//     // expect(member2Metrics.delegateSentCount).to.eq(1)
//     //
//     // console.log('end tx4')
//     //
//     // // member2 revoke delegation to member1
//     // // member1 prev balance 3000000000000000000 new balance 2000000000000000000
//     // // member2 prev balance 1000000000000000000 new balance 2000000000000000000
//     // const tx5 = await UnitDepUtils.getData(
//     //   GovernanceERC20.abi,
//     //   IEventLogMember.DelegateVotesChanged,
//     //   '0x2744c5a3f65084d54bd8a972a3743925b1dea2565ee1e9002061ef653ffd7e50',
//     //   network,
//     // )
//     //
//     // for (const { event, logInfo } of tx5) {
//     //   await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
//     // }
//     //
//     // // test member1 have a transaction, balance and correct metrics
//     // member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
//     // member1Balance = await Models.MemberBalance.findOne({ address: member1 })
//     // member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })
//     //
//     // expect(member1Txs).to.have.length(5)
//     // expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
//     // expect(member1Txs[0].from).to.eq(member1)
//     // expect(member1Txs[0].to).to.eq(member2)
//     // expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
//     // expect(member1Balance.votingPower).to.eq('2000000000000000000')
//     // expect(member1Balance.amount).to.eq('0')
//     // expect(member1Metrics.delegateReceivedCount).to.eq(2)
//     // expect(member1Metrics.delegateSentCount).to.eq(1)
//     //
//     // // test member2 have a transaction, balance and correct metrics
//     // member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
//     // member2Balance = await Models.MemberBalance.findOne({ address: member2 })
//     // member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })
//     //
//     // expect(member2Txs).to.have.length(3)
//     // expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
//     // expect(member2Txs[0].from).to.eq(member1)
//     // expect(member2Txs[0].to).to.eq(member2)
//     // expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
//     // expect(member2Txs[0].memberVotingPower).to.eq('2000000000000000000')
//     // expect(member2Balance.votingPower).to.eq('2000000000000000000')
//     // expect(member2Balance.amount).to.eq('0')
//     // expect(member2Metrics.delegateReceivedCount).to.eq(1)
//     // expect(member2Metrics.delegateSentCount).to.eq(0)
//     //
//     // console.log('end tx5')
//
//     console.log('end')
//   })
// })
