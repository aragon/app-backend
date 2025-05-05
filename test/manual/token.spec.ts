import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { ITokenType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import TokenDetector from '@helpers/tokenDetector'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import { expect } from 'chai'
import ProxyProvider from '@modules/proxyProvider'

describe('Manual: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(160000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    await ProxyToken.saveAndGetToken('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', NetworksEnum.ethereumMainnet)
  })

  it('should handle parallel requests and create the token only once', async () => {
    const tokenAddress = '0xD8981e488Dc62bc0f7aE6ce4bec09db0786aC2Db'
    const network = NetworksEnum.ethereumMainnet

    sandbox.stub(TokenDetector, 'detectTokenType').resolves({
      type: ITokenType.ERC20,
      isGovernance: true,
      implementationAddress: null,
    } as any)
    sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
      totalHolders: 1,
      totalSupply: '1',
    } as any)
    sandbox.stub(ProxyProvider, 'fetchContractCreation').resolves({
      blockNumber: 100,
      transactionHash: '0x000',
      address: tokenAddress,
    } as any)
    sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

    // Simulate three parallel calls to saveAndGetToken
    const [result1, result2, result3] = await Promise.all([
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
      ProxyToken.saveAndGetToken(tokenAddress, network),
    ])

    // Reload tokens from the database to ensure they match the result
    const tokensInDb = await Models.Token.find({ address: tokenAddress, network })

    // Assertions
    expect(tokensInDb.length).to.equal(1) // Ensure only one token is created in the database
    console.log(tokensInDb)
    expect(result1?.address).to.equal(tokenAddress)
    expect(result2?.address).to.equal(tokenAddress)
    expect(result3?.address).to.equal(tokenAddress)
    expect(result1?.id).to.equal(tokensInDb[0].id) // Ensure the returned token matches the created one
    expect(result2?.id).to.equal(tokensInDb[0].id)
    expect(result3?.id).to.equal(tokensInDb[0].id)
  })
})
