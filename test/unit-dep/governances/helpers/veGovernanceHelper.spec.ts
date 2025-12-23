import GovernanceVeHelper from '@helpers/governanceVe'
import { HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: GovernanceVeHelper', () => {
  let sandbox: SinonSandbox
  let escrowAdapter: HexAddress
  let escrowAddress: HexAddress
  let clockAddress: HexAddress
  let curveAddress: HexAddress
  let exitQueueAddress: HexAddress
  let nftLockAddress: HexAddress

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // escrowAdapter used as token
    escrowAdapter = '0xB2f5bC5e7Bb39081811e6a9FE98F6fCa5F5b78a7'
    escrowAddress = '0xC974bb9C80b8857c9A3D4Ba6cE6894F3419ec742'
    clockAddress = '0xc736A4b9b26a36f8b3837cF490ca6ECaD36AfA82'
    curveAddress = '0xd5E3b809496B86fC7F61C553d12bbE5447d126B6'
    exitQueueAddress = '0xc3d04134d2cb080BB7C5d0194Bb5e752614b8A0f'
    nftLockAddress = '0xa4E84C43C5F61Ae81B6995880f026A206A52aAD6'
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getEscrowAddress', async () => {
    // escrowAdapter used as token
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getEscrowAddress(escrowAdapter, network)
    expect(result).to.eq(escrowAddress)
  })

  it('getClockAddress', async () => {
    // escrowAdapter used as token
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getClockAddress(escrowAdapter, network)
    expect(result).to.eq(clockAddress)
  })

  it('getCurveAddress', async () => {
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getCurveAddress(escrowAddress, network)
    expect(result).to.eq(curveAddress)
  })

  it('getExitQueueAddress', async () => {
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getExitQueueAddress(escrowAddress, network)
    expect(result).to.eq(exitQueueAddress)
  })

  it('getNftLockAddress', async () => {
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getNftLockAddress(escrowAddress, network)
    expect(result).to.eq(nftLockAddress)
  })

  it('getMinDeposit', async () => {
    const network = NetworksEnum.ethereumSepolia
    const minDeposit = await GovernanceVeHelper.getMinDeposit(escrowAddress, network)
    expect(minDeposit).to.eq(100000000000000000000n)
  })

  it('getMinLock', async () => {
    const network = NetworksEnum.ethereumSepolia
    const minDeposit = await GovernanceVeHelper.getMinLock(exitQueueAddress, network)
    expect(minDeposit).to.eq(864000n)
  })

  it('getCooldown', async () => {
    const network = NetworksEnum.ethereumSepolia
    const cooldown = await GovernanceVeHelper.getCooldown(exitQueueAddress, network)
    expect(cooldown).to.eq(259200n)
  })

  it('getMaxTime', async () => {
    const network = NetworksEnum.ethereumSepolia
    const maxTime = await GovernanceVeHelper.getMaxTime(curveAddress, network)
    expect(maxTime).to.eq(0n)
  })

  it('getSettingFromCoefficients', async () => {
    const network = NetworksEnum.ethereumSepolia
    const result = await GovernanceVeHelper.getSettingFromCoefficients(curveAddress, network)
    expect(result.slope).to.eq(0n)
    expect(result.bias).to.eq(1000000000000000000n)
  })
})
