import { createAddressMapper } from '@modules/dispatchSimulation/addressMapper'
import { type IDaoResponse, NetworksEnum, type ITenderlyContract } from '@types'
import { expect } from 'chai'

describe('Module: dispatchSimulation/addressMapper', () => {
  const BURN_ADDRESS = '0x0000000000000000000000000000000000000000'

  describe('AddressMapper', () => {
    describe('resolve - burn addresses', () => {
      it('should resolve burn addresses correctly', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve(BURN_ADDRESS)

        expect(result.role).to.equal('burn')
        expect(result.label).to.equal('Burned')
        expect(result.isKnown).to.be.true
      })
    })

    describe('resolve - DAO addresses', () => {
      it('should resolve main DAO address with name', () => {
        const dao = {
          address: '0x1234567890123456789012345678901234567890',
          name: 'Test DAO',
          avatar: 'https://example.com/avatar.png',
          ens: 'testdao.eth',
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve(dao.address)

        expect(result.role).to.equal('dao')
        expect(result.label).to.equal('Test DAO')
        expect(result.isKnown).to.be.true
        expect(result.avatar).to.equal('https://example.com/avatar.png')
        expect(result.ens).to.equal('testdao.eth')
      })

      it('should resolve main DAO address without name as "Main DAO"', () => {
        const dao = {
          address: '0x1234567890123456789012345678901234567890',
          name: '',
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve(dao.address)

        expect(result.role).to.equal('dao')
        expect(result.label).to.equal('Main DAO')
      })

      it('should resolve DAO address case-insensitively', () => {
        const dao = {
          address: '0xABCDEF1234567890123456789012345678901234',
          name: 'Test DAO',
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve('0xabcdef1234567890123456789012345678901234')

        expect(result.role).to.equal('dao')
        expect(result.label).to.equal('Test DAO')
      })
    })

    describe('resolve - subDAO addresses', () => {
      it('should resolve subDAO addresses', () => {
        const dao = {
          address: '0x1111111111111111111111111111111111111111',
          name: 'Main DAO',
          linkedAccounts: [
            {
              address: '0x2222222222222222222222222222222222222222',
              name: 'LinkedAccount Alpha',
              avatar: 'https://example.com/linkedaccount.png',
              ens: 'linkedaccount.eth',
            },
            {
              address: '0x3333333333333333333333333333333333333333',
              name: 'LinkedAccount Beta',
            },
          ],
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })

        const alpha = mapper.resolve('0x2222222222222222222222222222222222222222')
        expect(alpha.role).to.equal('linkedaccount')
        expect(alpha.label).to.equal('LinkedAccount Alpha')
        expect(alpha.avatar).to.equal('https://example.com/linkedaccount.png')
        expect(alpha.ens).to.equal('linkedaccount.eth')

        const beta = mapper.resolve('0x3333333333333333333333333333333333333333')
        expect(beta.role).to.equal('linkedaccount')
        expect(beta.label).to.equal('LinkedAccount Beta')
      })

      it('should use "LinkedAccount" as fallback label when name is empty', () => {
        const dao = {
          address: '0x1111111111111111111111111111111111111111',
          name: 'Main DAO',
          linkedAccounts: [{ address: '0x2222222222222222222222222222222222222222', name: '' }],
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve('0x2222222222222222222222222222222222222222')

        expect(result.role).to.equal('linkedaccount')
        expect(result.label).to.equal('LinkedAccount')
      })
    })

    describe('resolve - contract addresses', () => {
      it('should resolve known contracts with names', () => {
        const contracts: ITenderlyContract[] = [
          {
            address: '0x4444444444444444444444444444444444444444',
            contract_name: 'USDC Token',
          },
        ]

        const mapper = createAddressMapper({ contracts, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve('0x4444444444444444444444444444444444444444')

        expect(result.role).to.equal('contract')
        expect(result.label).to.equal('USDC Token')
        expect(result.isKnown).to.be.true
      })

      it('should resolve contracts without names as truncated address', () => {
        const contracts: ITenderlyContract[] = [
          {
            address: '0x5555555555555555555555555555555555555555',
          },
        ]

        const mapper = createAddressMapper({ contracts, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve('0x5555555555555555555555555555555555555555')

        expect(result.role).to.equal('contract')
        expect(result.label).to.equal('0x5555...5555')
        expect(result.isKnown).to.be.false
      })

      it('should skip contracts without addresses', () => {
        const contracts: ITenderlyContract[] = [
          {
            address: '',
            contract_name: 'Invalid Contract',
          },
        ]

        const mapper = createAddressMapper({ contracts, network: NetworksEnum.ethereumMainnet })

        // Should not throw, just skip
        const result = mapper.resolve('0x6666666666666666666666666666666666666666')
        expect(result.role).to.equal('wallet')
      })

      it('should not override DAO address with contract', () => {
        const daoAddress = '0x7777777777777777777777777777777777777777'
        const dao = { address: daoAddress, name: 'My DAO' } as unknown as IDaoResponse
        const contracts: ITenderlyContract[] = [{ address: daoAddress, contract_name: 'Some Contract' }]

        const mapper = createAddressMapper({ dao, contracts, network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve(daoAddress)

        expect(result.role).to.equal('dao')
        expect(result.label).to.equal('My DAO')
      })
    })

    describe('resolve - unknown addresses', () => {
      it('should resolve unknown addresses as wallets', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })

        const result = mapper.resolve('0x8888888888888888888888888888888888888888')

        expect(result.role).to.equal('wallet')
        expect(result.label).to.equal('0x8888...8888')
        expect(result.isKnown).to.be.false
        expect(result.avatar).to.be.null
        expect(result.ens).to.be.null
      })
    })

    describe('addMapping', () => {
      it('should add new mapping for unknown address', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const address = '0x9999999999999999999999999999999999999999'

        mapper.addMapping(address, { role: 'contract', isKnown: false })

        const result = mapper.resolve(address)
        expect(result.role).to.equal('contract')
        expect(result.isKnown).to.be.false
      })

      it('should update existing mapping partially', () => {
        const dao = {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          name: 'Test DAO',
        } as unknown as IDaoResponse

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        mapper.addMapping(dao.address, { ens: 'newens.eth' })

        const result = mapper.resolve(dao.address)
        expect(result.role).to.equal('dao')
        expect(result.label).to.equal('Test DAO')
        expect(result.ens).to.equal('newens.eth')
      })

      it('should handle case-insensitive addresses', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })

        mapper.addMapping('0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', {
          role: 'contract',
          label: 'Test Contract',
        })

        const result = mapper.resolve('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
        expect(result.role).to.equal('contract')
        expect(result.label).to.equal('Test Contract')
      })
    })
  })
})
