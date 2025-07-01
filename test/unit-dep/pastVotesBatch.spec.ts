import * as sinon from 'sinon'
import { NetworksEnum } from '@types'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import ProviderModule from '@modules/provider'
import { expect } from 'chai'
import logger from '@logger'

describe('PastVotesBatch', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should return voting power for a member address', async () => {
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
