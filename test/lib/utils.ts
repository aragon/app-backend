import { NetworksEnum } from '@types'
import { SinonSandbox } from 'sinon'

let _pspAddressMap: Partial<Record<NetworksEnum, string>> | null = null

export const UnitTestUtils = {
  getPspAddressMap: async (): Promise<Partial<Record<NetworksEnum, string>>> => {
    if (_pspAddressMap) return _pspAddressMap
    const entries = await Promise.all(
      Object.values(NetworksEnum).map(async network => {
        const file = network.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        try {
          const contracts = await import(`../../config/contracts/${file}.json`)
          const version = Object.keys(contracts).find(v => contracts[v]?.PluginSetupProcessor)
          const address = version ? contracts[version].PluginSetupProcessor.address : undefined
          return [network, address] as [NetworksEnum, string | undefined]
        } catch {
          return [network, undefined] as [NetworksEnum, undefined]
        }
      }),
    )
    _pspAddressMap = Object.fromEntries(entries.filter(([, address]) => address !== undefined))
    return _pspAddressMap
  },

  getFakeProviders: (sandbox: SinonSandbox) => {
    let callCount = 0
    const getBlockNumber = sandbox.stub().callsFake(() => {
      callCount++
      return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
    })

    return {
      [NetworksEnum.ethereumMainnet]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.ethereumSepolia]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.polygonMainnet]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.arbitrumMainnet]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.baseMainnet]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.zksyncSepolia]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xdec', blockNumber: 6 }]),
        destroy: sandbox.stub().resolves(),
      },
      [NetworksEnum.zksyncMainnet]: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xded', blockNumber: 7 }]),
        destroy: sandbox.stub().resolves(),
      },
    }
  },
}
