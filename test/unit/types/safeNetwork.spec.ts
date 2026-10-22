import { getSafeShortName, safeTxServiceShortNames } from '@src/types/safeNetwork'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Types: safeNetwork', () => {
  it('resolves the Safe short name for BNB mainnet', () => {
    expect(safeTxServiceShortNames[NetworksEnum.bnbMainnet]).to.equal('bnb')
    expect(getSafeShortName(NetworksEnum.bnbMainnet)).to.equal('bnb')
  })

  it('resolves the Safe short name for Base Sepolia', () => {
    expect(safeTxServiceShortNames[NetworksEnum.baseSepolia]).to.equal('basesep')
    expect(getSafeShortName(NetworksEnum.baseSepolia)).to.equal('basesep')
  })

  it('returns undefined for testnets without a Safe service', () => {
    expect(getSafeShortName(NetworksEnum.ethereumHoodi)).to.be.undefined
    expect(getSafeShortName(NetworksEnum.polygonAmoy)).to.be.undefined
    expect(getSafeShortName(NetworksEnum.bnbTestnet)).to.be.undefined
  })

  it('returns undefined for a network with no Safe service', () => {
    expect(getSafeShortName(NetworksEnum.citreaMainnet)).to.be.undefined
  })
})
