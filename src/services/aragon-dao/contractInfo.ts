import { type IContractAbi, type NetworksEnum } from '@types'
import ProxyContract from '@helpers/proxyContract'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'

export const ContractInfo = {
  getContractInfo: async (network: NetworksEnum, address: string): Promise<IContractAbi | null> => {
    const mainData = await ContractInfo.fetchVerifiedContractData(network, address)
    const implementationAddress = (await ProxyContract.getImplementationAddress(address, network)) || address
    const isProxy = implementationAddress !== address

    const implementationData = isProxy
      ? await ContractInfo.fetchVerifiedContractData(network, implementationAddress)
      : null

    if (!mainData && !implementationData) return null

    const functions = [...(mainData?.functions || []), ...(implementationData?.functions || [])]

    const name = implementationData?.name || mainData?.name || ''

    return {
      implementationAddress: isProxy ? implementationAddress : null,
      address,
      network,
      name,
      proxyName: isProxy ? mainData?.name : null,
      functions,
    } satisfies IContractAbi
  },

  fetchVerifiedContractData: async (
    network: NetworksEnum,
    contractAddress: string,
  ): Promise<{ name: string; functions: any[] } | null> => {
    const contractDetails = await TokenDetailProvider.fetchContractSourceCode(contractAddress, network)

    if (!contractDetails?.length || !contractDetails[0].SourceCode) return null

    const parsed = ContractNetspecHelper.parseNetspec(
      contractDetails[0].SourceCode,
      contractDetails[0].ContractName,
      JSON.parse(contractDetails[0].ABI || '[]'),
    )

    if (!parsed?.length) return null

    return {
      name: contractDetails[0].ContractName,
      functions: ContractInfo.parseContractAbi(parsed),
    }
  },

  parseContractAbi: (abiResult: any[]) => {
    return abiResult
      .filter(
        fn =>
          fn.type === 'function' &&
          fn.stateMutability !== 'view' &&
          fn.stateMutability !== 'pure' &&
          fn.type !== 'constructor',
      )
      .map(fn => ({
        name: fn.name,
        parameters: fn.inputs,
        notice: fn.notice,
        type: fn.type,
        stateMutability: fn.stateMutability,
      }))
  },
}
