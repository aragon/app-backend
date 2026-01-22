/**
 * AddressMapper for simulation summary
 * Maps blockchain addresses to human-readable labels and roles
 */

import { type IFlowAddress, type ITenderlyContract, type IDaoResponse, type NetworksEnum } from '@types'

// ============================================================================
// Constants
// ============================================================================

const BURN_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead'

// ============================================================================
// Types
// ============================================================================

export interface IAddressMapperContext {
  dao?: IDaoResponse | null
  network: NetworksEnum
  contracts?: ITenderlyContract[]
}

// ============================================================================
// AddressMapper Class
// ============================================================================

export class AddressMapper {
  private addressMap: Map<string, IFlowAddress> = new Map()

  constructor(context: IAddressMapperContext) {
    this.buildMap(context)
  }

  private buildMap(context: IAddressMapperContext): void {
    const { dao, contracts } = context

    // Burn addresses
    this.addressMap.set(BURN_ADDRESS, {
      address: BURN_ADDRESS,
      label: 'Burned',
      role: 'burn',
      isKnown: true,
      avatar: null,
      ens: null,
    })

    this.addressMap.set(DEAD_ADDRESS, {
      address: DEAD_ADDRESS,
      label: 'Burned',
      role: 'burn',
      isKnown: true,
      avatar: null,
      ens: null,
    })

    // Main DAO
    if (dao) {
      this.addressMap.set(dao.address.toLowerCase(), {
        address: dao.address.toLowerCase(),
        label: dao.name || 'Main DAO',
        role: 'dao',
        isKnown: true,
        avatar: dao.avatar ?? null,
        ens: dao.ens ?? null,
      })

      // SubDAOs
      dao.subDaos?.forEach(subDao => {
        this.addressMap.set(subDao.address.toLowerCase(), {
          address: subDao.address.toLowerCase(),
          label: subDao.name || 'SubDAO',
          role: 'subdao',
          isKnown: true,
          avatar: subDao.avatar ?? null,
          ens: subDao.ens ?? null,
        })
      })
    }

    // Contract names from Tenderly response
    contracts?.forEach(contract => {
      if (!contract.address || !contract.contract_name) {
        return
      }
      const addr = contract.address.toLowerCase()
      if (!this.addressMap.has(addr)) {
        this.addressMap.set(addr, {
          address: addr,
          label: contract.contract_name,
          role: 'contract',
          isKnown: true,
          avatar: null,
          ens: null,
        })
      }
    })
  }

  resolve(address: string): IFlowAddress {
    const normalizedAddr = address.toLowerCase()

    const known = this.addressMap.get(normalizedAddr)
    if (known) {
      return known
    }

    return {
      address: normalizedAddr,
      label: this.truncateAddress(normalizedAddr),
      role: 'wallet',
      isKnown: false,
      avatar: null,
      ens: null,
    }
  }

  addMapping(address: string, info: Partial<IFlowAddress>): void {
    const normalizedAddr = address.toLowerCase()
    const existing = this.addressMap.get(normalizedAddr)

    this.addressMap.set(normalizedAddr, {
      address: normalizedAddr,
      label: info.label ?? existing?.label ?? this.truncateAddress(normalizedAddr),
      role: info.role ?? existing?.role ?? 'wallet',
      isKnown: info.isKnown ?? existing?.isKnown ?? false,
      avatar: info.avatar ?? existing?.avatar ?? null,
      ens: info.ens ?? existing?.ens ?? null,
    })
  }

  private truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }
}

export function createAddressMapper(context: IAddressMapperContext): AddressMapper {
  return new AddressMapper(context)
}
