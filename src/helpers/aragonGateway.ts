import {
  type Chain,
  type ClientConfig,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  http,
} from 'viem'
import { Client } from '@aragon/sdk-ipfs'
import {
  ChainRpcGateway,
  type INetworks,
  type NetworksEnum,
  TestNetworks,
  ViemChains,
} from '@types'
import config from '@config'

class AragonGateway {
  private readonly rpcVersion = '1.0'
  private readonly ipfsVersion = '1.0'
  private readonly baseUrl = config.ARAGON.GATEWAY_URL
  private readonly apiKey = config.ARAGON.GATEWAY_IPFS_API_KEY

  private readonly rpcClientConfig: Pick<ClientConfig, 'batch'> = {
    batch: {
      multicall: true,
    },
  }

  public getRpcClient = (
    network: INetworks,
  ): PublicClient<HttpTransport, Chain> => {
    const url = this._buildRpcUrl(network)
    const chain = ViemChains[network]
    const transport = http(url)

    const client = createPublicClient<HttpTransport, Chain>({
      transport,
      chain,
      ...this.rpcClientConfig,
    })

    return client
  }

  public getIpfsClient = (network: NetworksEnum): Client => {
    const headers = { 'X-API-KEY': this.apiKey }
    return new Client(this._buildIpfsUrl(network), headers)
  }

  _buildIpfsUrl(network: NetworksEnum): string {
    const isTestnet = TestNetworks.includes(network)
    const environment = isTestnet ? 'test' : 'prod'
    return `${this.baseUrl}/v${this.ipfsVersion}/ipfs/${environment}/api/v0`
  }

  _buildRpcUrl = (network: INetworks) => {
    return `${this.baseUrl}/v${this.rpcVersion}/rpc/${ChainRpcGateway[network]}/${this.apiKey}`
  }
}

export const aragonGateway = new AragonGateway()
