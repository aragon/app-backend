import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import Utils from '@helpers/utils'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Integ: EvmExplorerClient', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const testTokens = {
    [NetworksEnum.ethereumMainnet]: {
      address: '0x3520D16b3CA5A1a7e60A744630C65A603bB68953',
      symbol: 'USDC',
    },
  }

  describe('fetchContractSourceCode', function () {
    this.timeout(30000)

    describe('Etherscan', () => {
      for (const network in testTokens) {
        it(`should fetch contract source code for ${network} using Etherscan`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = await evmExplorerClient.fetchContractSourceCode(
            EvmExplorerEnum.ETHERSCAN,
            token.address,
            network as NetworksEnum,
          )

          expect(result).to.be.not.null
          expect(result).to.be.an('array')
          expect(result).to.have.length.greaterThan(0)

          const sourceCode = result![0]
          expect(sourceCode).to.have.property('SourceCode')
          expect(sourceCode).to.have.property('ContractName')
          expect(sourceCode).to.have.property('ABI')
          expect(sourceCode.SourceCode).to.not.be.empty
          expect(sourceCode.ContractName).to.not.be.empty

          await Utils.wait(1000)
        })
      }
    })

    describe('RouteScan', () => {
      for (const network in testTokens) {
        it(`should fetch contract source code for ${network} using RouteScan`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = (await evmExplorerClient.fetchContractSourceCode(
            EvmExplorerEnum.ROUTESCAN,
            token.address,
            network as NetworksEnum,
          )) as any

          expect(result).to.be.an('array')
          expect(result).to.have.length.greaterThan(0)

          const sourceCode = result[0]
          expect(sourceCode).to.have.property('SourceCode')
          expect(sourceCode).to.have.property('ContractName')
          expect(sourceCode).to.have.property('ABI')
          expect(sourceCode.SourceCode).to.not.be.empty
          expect(sourceCode.ContractName).to.not.be.empty

          await Utils.wait(1000)
        })
      }
    })

    describe('BlockScout', () => {
      for (const network in testTokens) {
        it(`should fetch contract source code for ${network} using BlockScout`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = (await evmExplorerClient.fetchContractSourceCode(
            EvmExplorerEnum.BLOCKSCOUT,
            token.address,
            network as NetworksEnum,
          )) as any

          expect(result).to.be.an('array')
          expect(result).to.have.length.greaterThan(0)

          const sourceCode = result[0]
          expect(sourceCode).to.have.property('SourceCode')
          expect(sourceCode).to.have.property('ContractName')
          expect(sourceCode).to.have.property('ABI')
          expect(sourceCode.SourceCode).to.not.be.empty
          expect(sourceCode.ContractName).to.not.be.empty

          await Utils.wait(1000)
        })
      }
    })

    describe('ChilizScan', () => {
      it(`should fetch contract source code for ${NetworksEnum.chilizMainnet} using ChilizScan`, async () => {
        const network = NetworksEnum.chilizMainnet
        const token = '0xFC66329Ce71d6e6160fc73f6D263995E15679c4b'

        const result = (await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.ROUTESCAN,
          token,
          network as NetworksEnum,
        )) as any

        expect(result).to.be.an('array')
        expect(result).to.have.length.greaterThan(0)

        const sourceCode = result[0]
        expect(sourceCode).to.have.property('SourceCode')
        expect(sourceCode).to.have.property('ContractName')
        expect(sourceCode).to.have.property('ABI')
        expect(sourceCode.SourceCode).to.not.be.empty
        expect(sourceCode.ContractName).to.not.be.empty

        await Utils.wait(1000)
      })
    })

    describe('ZkSyncScan', () => {
      it(`should fetch contract source code for ${NetworksEnum.zksyncMainnet} using ZkSyncScan`, async () => {
        const network = NetworksEnum.zksyncMainnet
        const token = '0xf8aDd95F880C5B4A30b0D5F574187A9423833752'

        const result = (await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.ZKSYNC,
          token,
          network as NetworksEnum,
        )) as any

        expect(result).to.be.an('array')
        expect(result).to.have.length.greaterThan(0)

        const sourceCode = result[0]
        expect(sourceCode).to.have.property('SourceCode')
        expect(sourceCode).to.have.property('ContractName')
        expect(sourceCode).to.have.property('ABI')
        expect(sourceCode.SourceCode).to.not.be.empty
        expect(sourceCode.ContractName).to.not.be.empty
      })

      it('should fetch contract source code for ZkSync Sepolia using zkScan', async () => {
        const network = NetworksEnum.zksyncSepolia
        const token = '0xBe77A25f427366A3424c4CFaFe597F33153b6D5C'
        const result = (await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.ZKSYNC,
          token,
          network as NetworksEnum,
        )) as any

        expect(result).to.be.an('array')
        expect(result).to.have.length.greaterThan(0)

        const sourceCode = result[0]
        expect(sourceCode).to.have.property('SourceCode')
        expect(sourceCode).to.have.property('ContractName')
        expect(sourceCode).to.have.property('ABI')
        expect(sourceCode.SourceCode).to.not.be.empty
        expect(sourceCode.ContractName).to.not.be.empty
      })
    })
  })

  describe('fetchContractCreation', function () {
    this.timeout(10000000)

    describe('Etherscan', () => {
      for (const network in testTokens) {
        it(`should fetch contract creation for ${network} using Etherscan`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = await evmExplorerClient.fetchContractCreation(
            EvmExplorerEnum.ETHERSCAN,
            token.address,
            network as NetworksEnum,
          )

          expect(result).to.be.not.null
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
          expect(result.address).to.equal(token.address)

          await Utils.wait(1000)
        })
      }
    })

    describe('RouteScan', () => {
      for (const network in testTokens) {
        it(`should fetch contract creation for ${network} using RouteScan`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = await evmExplorerClient.fetchContractCreation(
            EvmExplorerEnum.ROUTESCAN,
            token.address,
            network as NetworksEnum,
          )

          if (result) {
            expect(result).to.be.not.null
            expect(result).to.have.property('blockNumber')
            expect(result).to.have.property('transactionHash')
            expect(result).to.have.property('address')
            expect(result.address).to.equal(token.address)
          }

          await Utils.wait(1000)
        })
      }
    })

    describe('BlockScout', () => {
      for (const network in testTokens) {
        it(`should fetch contract creation for ${network} using BlockScout`, async () => {
          const token = testTokens[network as NetworksEnum]

          const result = await evmExplorerClient.fetchContractCreation(
            EvmExplorerEnum.BLOCKSCOUT,
            token.address,
            network as NetworksEnum,
          )

          if (result) {
            expect(result).to.be.not.null
            expect(result).to.have.property('blockNumber')
            expect(result).to.have.property('transactionHash')
            expect(result).to.have.property('address')
            expect(result.address).to.equal(token.address)
          }

          await Utils.wait(1000)
        })
      }
    })

    describe('ChilizScan', () => {
      it(`should fetch contract creation for ${NetworksEnum.chilizMainnet} using ChilizScan`, async () => {
        const network = NetworksEnum.chilizMainnet
        const token = '0xFC66329Ce71d6e6160fc73f6D263995E15679c4b'

        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ROUTESCAN,
          token,
          network as NetworksEnum,
        )

        if (result) {
          expect(result).to.be.not.null
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
          expect(result.address).to.equal(token)
        }

        await Utils.wait(1000)
      })
    })

    describe('ZkSyncScan', () => {
      it(`should fetch contract creation for ${NetworksEnum.zksyncMainnet} using ZkSyncScan`, async () => {
        const network = NetworksEnum.zksyncMainnet
        const token = '0x7597E841c1Ff21bfA297e93B14703e461763735B'

        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ZKSYNC,
          token,
          network as NetworksEnum,
        )

        if (result) {
          expect(result).to.be.not.null
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
          expect(result.address).to.equal(token)
        }
      })

      it('should fetch contract creation for ZkSync Sepolia using zkScan', async () => {
        const network = NetworksEnum.zksyncSepolia
        const token = '0x42327460Caf5308edb4DC3b4180Ad9E7449c66A9'
        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ZKSYNC,
          token,
          network as NetworksEnum,
        )
        if (result) {
          expect(result).to.be.not.null
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
          expect(result.address).to.equal(token)
        }
      })
    })
  })
})
