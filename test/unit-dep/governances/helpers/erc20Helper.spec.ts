import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IClockMode, NetworksEnum } from '@types'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import ProviderModule from '@modules/provider'
import logger from '@logger'

describe('Integ: GovernanceErc20Helper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getPastVotes', () => {
    it('getPastVotes', async () => {
      const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
      const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
      const blockNumber = 16733703
      const blockTimestamp = 1677672875
      const network = NetworksEnum.ethereumMainnet
      const pastVotes = await GovernanceErc20Helper.getPastVotes(
        memberAddress,
        tokenAddress,
        blockNumber,
        blockTimestamp,
        network,
        IClockMode.BlockNumber,
      )
      expect(pastVotes).to.eq('500000000000000000000')
    })

    it('getPastVotes for list of members', async () => {
      const members = [
        {
          network: NetworksEnum.ethereumMainnet,
          memberAddress: '0xD43904fBb5BC68ff6A7Fc855107864aEC368e2a0',
          tokenAddress: '0x01A3a51246Bc4A34BB3018B7cd0E81F22729046F',
        },
        {
          network: NetworksEnum.ethereumSepolia,
          memberAddress: '0xECAe3e72a037485B6CC9c457DAC623CEC627BDae',
          tokenAddress: '0x001DD6c6E84C99eE0e408f211a466b40608231B8',
        },
        {
          network: NetworksEnum.polygonMainnet,
          memberAddress: '0xA3D5BBfc9f4d7e0a85Ad19A4Bb8146912C3A0706',
          tokenAddress: '0x000aC18Fc5d6Edc9253629320BcC343b3C1F2728',
        },
        {
          network: NetworksEnum.baseMainnet,
          memberAddress: '0x7f96a6269B00c56cdC319721be80bf8C290324a5',
          tokenAddress: '0x0032fA628DA171Cb3E36758d3760B5697124B8d8',
        },
        {
          network: NetworksEnum.optimismMainnet,
          memberAddress: '0xb2367fA60029e5157543E5c2E69A2D26cA8D140d',
          tokenAddress: '0x3E3F51a5d2Cc9A3d55b57de3c5aE50507b8208d8',
        },
        {
          network: NetworksEnum.cornMainnet,
          memberAddress: '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB',
          tokenAddress: '0x5b4897e8f33c24e97786e703F28b070b47a7491d',
        },
        {
          network: NetworksEnum.chilizMainnet,
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          tokenAddress: '0xa1911f809ae9117C5B9a76CF402de03e8cEEa4D9',
        },
        {
          network: NetworksEnum.peaqMainnet,
          memberAddress: '0x6411D9C53Ba6b59112902b7BfeBfe097F3d1ed9f',
          tokenAddress: '0x29d163765e66c6c052d86ce296e9E31DCB29e929',
        },
      ]

      for (const member of members) {
        const provider = ProviderModule.getAnyRpcProvider(member.network)
        if (!provider) {
          continue
        }
        const block = await provider.getBlock('latest')

        const result = await GovernanceErc20Helper.getPastVotes(
          member.memberAddress,
          member.tokenAddress,
          block.number,
          block.timestamp,
          member.network,
          IClockMode.BlockNumber,
        )

        expect(result).to.be.a('string')
        expect(result).to.be.not.eq('0')

        logger.info('Past Votes:', {
          memberAddress: member.memberAddress,
          tokenAddress: member.tokenAddress,
          network: member.network,
          result,
        })
      }
    })
  })

  it('getVotes', async () => {
    const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const pastVotes = await GovernanceErc20Helper.getVotes(memberAddress, tokenAddress, network)
    expect(pastVotes).to.eq(500000000000000000000n)
  })

  it('getPastTotalSupply', async () => {
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const blockNumber = 16733703
    const network = NetworksEnum.ethereumMainnet
    const totalSupply = await GovernanceErc20Helper.getPastTotalSupply({
      blockNumber,
      network,
      tokenAddress,
      blockTimestamp: 0,
      clockMode: IClockMode.BlockNumber,
    })
    expect(totalSupply).to.eq('500000000000000000000')
  })

  it('getDelegates', async () => {
    const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const delegate = await GovernanceErc20Helper.getDelegates(memberAddress, tokenAddress, network)
    expect(delegate).to.eq('0xc1d60f584879f024299DA0F19Cdb47B931E35b53')
  })
})
