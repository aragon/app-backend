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

    it('normalizes parsed addresses to checksum case', () => {
      const ref = DaoIdParser.parse(`ethereum-mainnet-${DAO.toLowerCase()}`)
      expect(ref?.daoAddress).to.eq(DAO)
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

  describe('parseEns', () => {
    it('returns null for empty / whitespace input', () => {
      expect(DaoIdParser.parseEns('')).to.be.null
      expect(DaoIdParser.parseEns('   ')).to.be.null
    })

    it('parses a bare ENS name onto ethereum mainnet', () => {
      expect(DaoIdParser.parseEns('polygoncommunitytreasury.dao.eth')).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        ens: 'polygoncommunitytreasury.dao.eth',
      })
    })

    it('lowercases the ENS name', () => {
      expect(DaoIdParser.parseEns('MyDao.DAO.eth')?.ens).to.eq('mydao.dao.eth')
    })

    it("parses the app's default URL that carries the ENS name in place of the address", () => {
      const url = 'https://app.aragon.org/dao/ethereum-mainnet/polygoncommunitytreasury.dao.eth/dashboard'
      expect(DaoIdParser.parseEns(url)).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        ens: 'polygoncommunitytreasury.dao.eth',
      })
    })

    it('rejects a URL with an unknown network', () => {
      expect(DaoIdParser.parseEns('https://app.aragon.org/dao/unknown-net/name.dao.eth')).to.be.null
    })

    it('rejects non-ENS shapes', () => {
      expect(DaoIdParser.parseEns('name.eth')).to.be.null
      expect(DaoIdParser.parseEns('citrea')).to.be.null
      expect(DaoIdParser.parseEns(`ethereum-mainnet-${DAO}`)).to.be.null
    })
  })
})
