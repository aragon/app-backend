import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

describe('AragonTelegram: DaoIdParser', () => {
  describe('parse', () => {
    it('returns null for empty / whitespace input', () => {
      expect(DaoIdParser.parse('')).to.be.null
      expect(DaoIdParser.parse('   ')).to.be.null
    })

    it('parses the canonical kebab single-arg form', () => {
      const ref = DaoIdParser.parse(`ethereum-sepolia-${DAO}`)
      expect(ref).to.deep.eq({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO })
    })

    it('parses the camelCase single-arg form', () => {
      const ref = DaoIdParser.parse(`ethereumSepolia-${DAO}`)
      expect(ref).to.deep.eq({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO })
    })

    it('parses the space-separated form', () => {
      const ref = DaoIdParser.parse(`ethereum-mainnet ${DAO}`)
      expect(ref).to.deep.eq({ network: NetworksEnum.ethereumMainnet, daoAddress: DAO })
    })

    it('parses an Aragon app URL', () => {
      const url = `https://app.aragon.org/dao/ethereum-sepolia/${DAO}`
      expect(DaoIdParser.parse(url)).to.deep.eq({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
    })

    it('parses a URL with trailing path segments', () => {
      const url = `https://app.aragon.org/dao/ethereum-sepolia/${DAO}/proposals/12`
      expect(DaoIdParser.parse(url)).to.deep.eq({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
    })

    it('rejects an unknown network', () => {
      expect(DaoIdParser.parse(`unknown-network-${DAO}`)).to.be.null
    })

    it('rejects a malformed address', () => {
      expect(DaoIdParser.parse('ethereum-mainnet-0xnothex')).to.be.null
      expect(DaoIdParser.parse('ethereum-mainnet 0x123')).to.be.null
    })

    it('rejects bare addresses with no network', () => {
      expect(DaoIdParser.parse(DAO)).to.be.null
    })

    it('handles surrounding whitespace', () => {
      expect(DaoIdParser.parse(`  ethereum-mainnet-${DAO}  `)).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        daoAddress: DAO,
      })
    })
  })

  describe('format', () => {
    it('joins network and address with a dash', () => {
      expect(DaoIdParser.format(NetworksEnum.ethereumSepolia, DAO)).to.eq(`${NetworksEnum.ethereumSepolia}-${DAO}`)
    })

    it('round-trips with parse', () => {
      const formatted = DaoIdParser.format(NetworksEnum.polygonMainnet, DAO)
      expect(DaoIdParser.parse(formatted)).to.deep.eq({
        network: NetworksEnum.polygonMainnet,
        daoAddress: DAO,
      })
    })
  })
})
