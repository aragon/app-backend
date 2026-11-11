import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type DAO_ENS, NetworksEnum } from '@types'

const EnsHelper = {
  async getDaoEns({
    daoAddress,
    subdomain,
  }: {
    daoAddress: string
    subdomain: string | null
  }): Promise<DAO_ENS | null> {
    if (!subdomain) return null

    const cleanSubdomain = subdomain.replace(/\.dao\.eth$/i, '')
    const fullName = `${cleanSubdomain}.${config.ENS_DOMAIN}` as DAO_ENS

    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)
    const resolvedAddress = (await retryRequest(() =>
      BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(() =>
        provider.resolveName(fullName),
      ),
    )) as string | null

    return resolvedAddress?.toLowerCase() === daoAddress.toLowerCase() ? fullName : null
  },
}

export default EnsHelper
