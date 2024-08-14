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
import {TokenProxy} from "@modules/tokenProxy";

describe('Manual: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('should fetchAllTransactions', async () => {
    await ProviderModule.connectToAllNetworks()
    await Utils.wait(2000)

    const a = await TokenProxy.getTokenCreationInfo('0x5B08305497fb3a087Fc582D45fcb648c98177c43', NetworksEnum.ethereumSepolia)
    console.log(a)
    const daoFactoryAddress = '0x5B08305497fb3a087Fc582D45fcb648c98177c43'
    const response = await EtherscanHelper.fetchContractInfo({
      contractAddress: daoFactoryAddress,
      network: NetworksEnum.ethereumSepolia,
    })
    console.log(response.txHash) // eslint-disable-line no-console

    const response2 = await EtherscanHelper.fetchContractSourceCode({
      contractAddress: daoFactoryAddress,
      network: NetworksEnum.ethereumSepolia,
    })
    console.log(response2) // eslint-disable-line no-console
  })

  it.skip('should save all the contracts in the file', async function () {
    this.timeout(600000) // Increase timeout for the test

    const deploymentInfo = Object.values(Object.values(SepliaContracts)[0])
    const allContracts = deploymentInfo.map(contract => {
      return contract.address
    })

    config.ETHERSCAN_API.ETHEREUM_SEPOLIA.API_KEY = ''
    config.BLOCKCHAIN_NODES.ETHEREUM_SEPOLIA = ''
    await ProviderModule.connectToAllNetworks()
    await Utils.wait(2000)

    for (const contract of allContracts) {
      let implementationAddress = await ProxyContract.getImplementationAddress(contract, NetworksEnum.ethereumSepolia)
      if (!implementationAddress) {
        implementationAddress = contract
      }

      const response = await EtherscanHelper.fetchContractSourceCode({
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
