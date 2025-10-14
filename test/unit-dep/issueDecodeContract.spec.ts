import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import ProxyContract from '@helpers/proxyContract'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { expect } from 'chai'

describe('Integ: Issue Decode Contract Spec', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('test decode contract action', async function () {
    this.timeout(10000000)

    async function parseContractNetspec(contractAddr: string, network: NetworksEnum) {
      let implementationAddress = await ProxyContract.getImplementationAddress(contractAddr, network)

      if (!implementationAddress) {
        implementationAddress = contractAddr
      }

      const contractDetails = await ProxyWeb3Provider.fetchContractSourceCode({
        address: implementationAddress,
        network,
      })

      if (contractDetails && contractDetails.length > 0 && contractDetails[0].SourceCode !== '') {
        const contractAbi = JSON.parse(contractDetails[0].ABI)
        return ContractNetspecHelper.parseNetspec(
          contractDetails[0].SourceCode,
          contractDetails[0].ContractName,
          contractAbi,
          contractDetails[0].CompilerVersion,
        )
      } else {
        console.log('No source code found for contract:', implementationAddress, 'on network:', network)
        return null
      }
    }

    const contracts = [
      {
        address: '0x037817B0C09b02DAc0F2B66dAc26e75e2999C15c',
        network: NetworksEnum.chilizMainnet,
      },
      {
        address: '0x428C144b4e0E1DF244746632f6891e1a03541de4',
        network: NetworksEnum.zksyncMainnet,
      },
      {
        address: '0x80bfb69E767E2B08F64629Cd9E52E150191486C4',
        network: NetworksEnum.zksyncSepolia,
      },
      {
        address: '0x604953e159562FeEfF38961541415B0C0694Ef5A',
        network: NetworksEnum.cornMainnet,
      },
      {
        address: '0x45312ea0eff7e09c83cbe249fa1d7598c4c8cd4e',
        network: NetworksEnum.ethereumMainnet,
      },
      {
        address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
        network: NetworksEnum.ethereumSepolia,
      },
      {
        address: '0x0a3f85fa597B6a967271286aA0724811acDF5CD9',
        network: NetworksEnum.ethereumSepolia,
      },
      {
        address: '0x74661e388b6C361F9fe14f45b421B0F6D9Cf97C6',
        network: NetworksEnum.ethereumMainnet,
      },
      {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        network: NetworksEnum.ethereumMainnet,
      },
    ]

    for (const { address: contractAddr, network } of contracts) {
      const response = await parseContractNetspec(contractAddr, network)
      if (response) {
        expect(response).to.be.an('array')
        console.log('Contract:', contractAddr, 'on network:', network, 'has netspec')
      }
    }
  })
})
