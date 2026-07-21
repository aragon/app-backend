import { Models } from '@dbModels'
import TokenEligibilityCache from '@modules/tokenEligibilityCache'
import { PluginList } from '@test/mock/fakePlugins'
import { FakeToken } from '@test/mock/fakeToken'
import { IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const tokenAddress = ethers.getAddress('0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95')
const network = NetworksEnum.ethereumMainnet

/**
 * The fixtures carry hardcoded 2024 timestamps; strip them so created docs get
 * real ones — the cursor-delta tests depend on creation time being "now".
 */
const { createdAt: _pc, updatedAt: _pu, ...pluginFixture } = PluginList[0] as Record<string, any>
const { createdAt: _tc, updatedAt: _tu, ...tokenFixture } = FakeToken as Record<string, any>

const createPlugin = (overrides: Record<string, any> = {}) =>
  Models.Plugin.create({
    ...pluginFixture,
    interfaceType: IPluginInterfaceType.tokenVoting,
    status: IPluginStatus.installed,
    isSupported: true,
    tokenAddress,
    network,
    ...overrides,
  })

const createToken = (overrides: Record<string, any> = {}) =>
  Models.Token.create({
    ...tokenFixture,
    address: tokenAddress,
    ignoreTransfer: false,
    type: ITokenType.ERC20,
    hasDelegate: true,
    network,
    ...overrides,
  })

describe('Module: TokenEligibilityCache', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    TokenEligibilityCache.clear()
  })

  afterEach(() => {
    sandbox.restore()
    TokenEligibilityCache.clear()
  })

  it('should resolve an eligible token from any casing to the stored checksummed value', async () => {
    await createPlugin()
    await createToken()

    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress.toLowerCase())).to.equal(tokenAddress)
    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)
  })

  it('should not be eligible without a matching tokenVoting plugin', async () => {
    await createToken()

    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.be.undefined
  })

  it('should not be eligible without a matching syncable token', async () => {
    await createPlugin()

    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.be.undefined
  })

  it('should revoke eligibility when the token stops being syncable', async () => {
    await createPlugin()
    const token = await createToken()

    await TokenEligibilityCache.refresh(network)
    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)

    await token.update({ ignoreTransfer: true })
    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.be.undefined
  })

  it('should revoke eligibility when the only plugin is uninstalled', async () => {
    const plugin = await createPlugin()
    await createToken()

    await TokenEligibilityCache.refresh(network)
    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)

    await plugin.update({ status: IPluginStatus.uninstalled })
    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.be.undefined
  })

  it('should keep eligibility while another eligible plugin still references the token', async () => {
    const plugin = await createPlugin()
    await createPlugin({
      id: 'second-plugin-id',
      address: '0xBf8dE4316E2778E26b12dad8906467b23BB9A200',
      transactionHash: '0x6f3e8a941b2140d72e402e35078fd459478222e146aa6d6bd6832d322de5dd00',
    })
    await createToken()

    await TokenEligibilityCache.refresh(network)
    await plugin.update({ status: IPluginStatus.uninstalled })
    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)
  })

  it('should pick up eligibility created after the initial load via the cursor delta', async () => {
    await TokenEligibilityCache.refresh(network)
    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.be.undefined

    await createPlugin()
    await createToken()
    await TokenEligibilityCache.refresh(network)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)
  })

  it('should keep networks isolated', async () => {
    await createPlugin()
    await createToken()

    await TokenEligibilityCache.refresh(network)
    await TokenEligibilityCache.refresh(NetworksEnum.polygonMainnet)

    expect(TokenEligibilityCache.getChecksummed(network, tokenAddress)).to.equal(tokenAddress)
    expect(TokenEligibilityCache.getChecksummed(NetworksEnum.polygonMainnet, tokenAddress)).to.be.undefined
  })

  it('should only query the delta window on subsequent refreshes', async () => {
    const pluginFindSpy = sandbox.spy(Models.Plugin, 'find')
    const tokenFindSpy = sandbox.spy(Models.Token, 'find')

    await TokenEligibilityCache.refresh(network)
    expect(pluginFindSpy.called).to.be.false
    expect(tokenFindSpy.called).to.be.false

    await TokenEligibilityCache.refresh(network)
    expect(pluginFindSpy.calledOnce).to.be.true
    expect(pluginFindSpy.firstCall.args[0]).to.have.property('updatedAt')
    expect(tokenFindSpy.calledOnce).to.be.true
    expect(tokenFindSpy.firstCall.args[0]).to.have.property('updatedAt')
  })

  it('should not run concurrent refreshes for the same network', async () => {
    const distinctSpy = sandbox.spy(Models.Token, 'distinct')

    await Promise.all([TokenEligibilityCache.refresh(network), TokenEligibilityCache.refresh(network)])

    expect(distinctSpy.calledOnce).to.be.true
  })
})
