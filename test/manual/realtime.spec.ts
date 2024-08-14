// import * as sinon from 'sinon'
// import { SinonSandbox } from 'sinon'
// import ProviderModule from '@modules/provider'
// import config from '@config'
// import EnsHelper from '@helpers/ens'
// import { NetworksEnum } from '@types'
// import { Contract } from 'ethers'
//
// describe('Manual: Web3', () => {
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
//   it('should get ens from address as viem way', async () => {
//     await ProviderModule.connectToAllNetworks()
//     const provider = ProviderModule.providerProxies[NetworksEnum.arbitrumMainnet]
//
//     const contract = new Contract(contractAddress, contractABI, provider)
//
//     contract.on(
//       {
//         address: contractAddress,
//         topics: [id('ExampleEvent(uint256,string)')],
//         fromBlock: startBlock,
//         toBlock: currentBlock,
//       },
//       (id, exampleField, event) => {
//         console.log(`Event received! ID: ${id.toString()}, Example Field: ${exampleField}`)
//         console.log(event)
//       },
//     )
//   })
// })
