import { SinonSandbox } from 'sinon'

export const UnitTestUtils = {
  getFakeProviders: (sandbox: SinonSandbox) => {
    let callCount = 0
    const getBlockNumber = sandbox.stub().callsFake(() => {
      callCount++
      return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
    })

    const fakeProvider = {
      mainnet: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
        destroy: sandbox.stub().resolves(),
      },
      sepolia: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
        destroy: sandbox.stub().resolves(),
      },
      polygon: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
        destroy: sandbox.stub().resolves(),
      },
      arbitrum: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
        destroy: sandbox.stub().resolves(),
      },
      base: {
        getBlockNumber,
        getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
        destroy: sandbox.stub().resolves(),
      },
    }

    return fakeProvider
  },
}
