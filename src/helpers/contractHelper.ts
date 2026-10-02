import { Models } from '@dbModels'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { HexAddress, IEtherScanSource, NetworksEnum } from '@types'
import { ethers, keccak256 } from 'ethers'

const ContractHelper = {
  async getBytecode(address: HexAddress, network: NetworksEnum): Promise<string | null> {
    const normalizedAddress = ethers.getAddress(address) as HexAddress

    // 1. Check DB first (treat '0x' as cache miss - may be fake data from getSourceCode)
    const cached = await Models.Contract.getBytecode(normalizedAddress, network)
    if (cached && cached !== '0x') return cached

    // 2. Fetch from chain
    const provider = ProviderModule.getAnyRpcProvider(network)
    const bytecode: string = await BottleneckModule.getNodeLimiter(network).schedule(
      async (): Promise<string> => provider.getCode(normalizedAddress),
    )

    if (!bytecode || bytecode === '0x') return null

    // 3. Store in DB (upsert to avoid duplicates from concurrent calls)
    const bytecodeHash = keccak256(bytecode)
    const id = Models.Contract.getEntityId({ address: normalizedAddress, network })
    await Models.Contract.findOneAndUpdate(
      { id },
      { id, address: normalizedAddress, network, bytecode, bytecodeHash },
      { upsert: true },
    )

    return bytecode
  },

  async getSourceCode(address: HexAddress, network: NetworksEnum): Promise<IEtherScanSource[] | null> {
    const normalizedAddress = ethers.getAddress(address) as HexAddress

    // 1. Check DB first
    const cached = await Models.Contract.findOne({ address: normalizedAddress, network })
    if (cached?.sourceCode && cached?.abi) {
      return [
        {
          SourceCode: cached.sourceCode,
          ABI: cached.abi,
          ContractName: cached.contractName || '',
          CompilerVersion: cached.compilerVersion || '',
        },
      ]
    }

    // 2. Fetch from Etherscan/Routescan
    const sourceData = await ProxyWeb3Provider.fetchContractSourceCode({ address: normalizedAddress, network })
    if (!sourceData || sourceData.length === 0 || !sourceData[0].ABI) return null

    // 3. Store in DB
    const updateData: any = {
      id: Models.Contract.getEntityId({ address: normalizedAddress, network }),
      address: normalizedAddress,
      network,
      sourceCode: sourceData[0].SourceCode,
      abi: sourceData[0].ABI,
      contractName: sourceData[0].ContractName,
      compilerVersion: sourceData[0].CompilerVersion || null,
      isVerified: true,
    }
    // Preserve existing meaningful bytecode/bytecodeHash if already cached
    if (cached?.bytecode && cached.bytecode !== '0x' && cached.bytecodeHash) {
      updateData.bytecode = cached.bytecode
      updateData.bytecodeHash = cached.bytecodeHash
    }
    await Models.Contract.findOneAndUpdate(
      { id: Models.Contract.getEntityId({ address: normalizedAddress, network }) },
      updateData,
      {
        upsert: true,
      },
    )

    return sourceData
  },
}

export default ContractHelper
