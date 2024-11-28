import { type IContractAbi, type NetworksEnum } from '@types'
import ProxyContract from '@helpers/proxyContract'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import Etherscan from '@helpers/etherscan'
import * as ContractNetspecHelper from '@helpers/contractNetspec'

export const getContractInfo = async (network: NetworksEnum, address: string) => {
  const response: IContractAbi = {
    implementationAddress: null,
    name: '',
    functions: [],
  }

  let implementationAddress = await ProxyContract.getImplementationAddress(address, network)

  if (!implementationAddress) {
    implementationAddress = address
  } else {
    response.implementationAddress = implementationAddress
  }

  const contractDetails = await retryRequest(async () =>
    BottleneckModule.getNodeLimiter(network)!.schedule(
      async () =>
        Etherscan.fetchContractSourceCode({
          contractAddress: implementationAddress,
          network,
        }),
      { retryRequest: true },
    ),
  )

  if (contractDetails && contractDetails.length > 0 && contractDetails[0].SourceCode !== '') {
    const results = ContractNetspecHelper.parseNetspec(
      contractDetails[0].SourceCode,
      contractDetails[0].ContractName,
      JSON.parse(contractDetails[0].ABI),
    )

    if (results?.length) {
      response.name = contractDetails[0].ContractName
      // adjust the component stuffs
      response.functions = results
        .filter(
          (action: any) =>
            action.type === 'function' &&
            action.stateMutability !== 'view' &&
            action.stateMutability !== 'pure' &&
            action.stateMutability !== 'constructor',
        )
        .map((_function: any) => {
          return {
            name: _function.name,
            parameters: _function.inputs,
            notice: _function.notice,
            type: _function.type,
            stateMutability: _function.stateMutability,
          }
        })
    }
  }

  return response
}

export default getContractInfo
