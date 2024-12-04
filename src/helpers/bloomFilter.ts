import { isContractAddressInBloom, isUserEthereumAddressInBloom, isTopicInBloom } from 'ethereum-bloom-filters'
import axios from 'axios'
import { type NetworksEnum } from '@types'
import config from '@config'
import ProviderModule from '@modules/provider'

export const BloomFilterHelper = {
  /**
   * Check if all addresses and at least one topic are present in the bloom filter
   * @param {string} bloom - The bloom filter (hex string)
   * @param {string[]} addresses - Array of Ethereum addresses
   * @param {string[]} topics - Array of log topics
   * @returns {boolean} - True if all addresses and at least one topic are potentially present, otherwise false
   */
  areAddressAndTopicInBloom(bloom: string, addresses: string[], topics: string[]) {
    const allAddressesMatch = addresses.every(address => isContractAddressInBloom(bloom, address))

    if (!allAddressesMatch) return false

    return topics.some(topic => isTopicInBloom(bloom, topic))
  },
}
