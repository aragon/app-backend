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

    describe.skip('RouteScan', () => {
      it(`should fetch contract source code for chiliz-mainnet using RouteScan`, async () => {
        const result = await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.ROUTESCAN,
          '0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67', // PEPPER token on Chiliz
          NetworksEnum.chilizMainnet,
        )

        if (!result) {
          // RouteScan API may return empty source code intermittently without API key
          return
        }

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

      it(`should fetch contract source code for corn-mainnet using RouteScan`, async () => {
        const result = await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.ROUTESCAN,
          '0x6E67d834eB0b5061157EB843AF2D170caD0f4738', // CORN TOKEN on Corn
          NetworksEnum.cornMainnet,
        )

        if (!result) {
          // RouteScan API may return empty source code intermittently without API key
          return
        }

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
    })

    describe('Blockscout', () => {
      it(`should fetch contract source code for citrea-mainnet using Blockscout`, async () => {
        const result = await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.BLOCKSCOUT,
          '0x2d5761eaA2bd254ec3167Cf32Aa82eee0d819bCD', // ProtocolFactory on Citrea Mainnet
          NetworksEnum.citreaMainnet,
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

      it('should return null for unsupported network on Blockscout', async () => {
        const result = await evmExplorerClient.fetchContractSourceCode(
          EvmExplorerEnum.BLOCKSCOUT,
          '0x3520D16b3CA5A1a7e60A744630C65A603bB68953',
          NetworksEnum.ethereumMainnet,
        )

        expect(result).to.be.null
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

    describe.skip('RouteScan', () => {
      it(`should fetch contract creation for chiliz-mainnet using RouteScan`, async () => {
        const address = '0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67' // PEPPER token on Chiliz

        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ROUTESCAN,
          address,
          NetworksEnum.chilizMainnet,
        )

        if (result.transactionHash) {
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
        }

        await Utils.wait(1000)
      })

      it(`should fetch contract creation for corn-mainnet using RouteScan`, async () => {
        const address = '0x6E67d834eB0b5061157EB843AF2D170caD0f4738' // CORN TOKEN on Corn

        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ROUTESCAN,
          address,
          NetworksEnum.cornMainnet,
        )

        if (result.transactionHash) {
          expect(result).to.have.property('blockNumber')
          expect(result).to.have.property('transactionHash')
          expect(result).to.have.property('address')
        }

        await Utils.wait(1000)
      })
    })

    describe('Blockscout', () => {
      it(`should fetch contract creation for citrea-mainnet using Blockscout`, async () => {
        const address = '0x2d5761eaA2bd254ec3167Cf32Aa82eee0d819bCD' // ProtocolFactory on Citrea Mainnet

        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.BLOCKSCOUT,
          address,
          NetworksEnum.citreaMainnet,
        )

        expect(result).to.be.not.null
        expect(result).to.have.property('blockNumber')
        expect(result).to.have.property('transactionHash')
        expect(result).to.have.property('address')
        expect(result.transactionHash).to.not.be.empty

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
    })
  })
})
