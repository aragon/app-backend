import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import EtherscanHelper from '@helpers/etherscan'
import SepliaContracts from '@src/../config/contracts/ethereumSepolia.json'
import ProxyContract from '@helpers/proxyContract'
import { NetworksEnum } from '@types'
import config from '@config'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import * as fs from 'fs'
import Utils from '@helpers/utils'
import ProviderModule from '@modules/provider'

describe('Manual: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should fetchAllTransactions', async () => {
    const daoFactoryAddress = '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0'
    const response = await EtherscanHelper.fetchAllTransactions({
      contractAddress: daoFactoryAddress,
      network: NetworksEnum.ethereumMainnet,
    })
    console.log(response) // eslint-disable-line no-console
  })

  it.skip('should save all the contracts in the file', async function () {
    this.timeout(600000) // Increase timeout for the test

    const deploymentInfo = Object.values(Object.values(SepliaContracts)[0])
    const allContracts = deploymentInfo.map(contract => {
      return contract.address
    })

    config.NODES.ETHEREUM_SEPOLIA.ALCHEMY_API_KEY = ''

    await ProviderModule.connectToAllNetworks()
    await Utils.wait(2000)

    for (const contract of allContracts) {
      let implementationAddress = await ProxyContract.getImplementationAddress(contract, NetworksEnum.ethereumSepolia)
      if (!implementationAddress) {
        implementationAddress = contract
      }

      const response: any = await EtherscanHelper.fetchContractSourceCode({
        contractAddress: contract,
        network: NetworksEnum.ethereumSepolia,
      })
      if (response) {
        const results = ContractNetspecHelper.parseNetspec(
          response.SourceCode,
          response.ContractName,
          JSON.parse(response.ABI),
        )
        const toSave = {
          contractName: response.ContractName,
          abi: results,
          implAddress: implementationAddress,
          address: contract,
        }
        fs.writeFileSync(`src/aragonContracts/${response.ContractName}.json`, JSON.stringify(toSave, null, 2))
        await Utils.wait(2000)
        console.log('Saved', toSave.contractName) // eslint-disable-line no-console
      }
    }
  })
})
