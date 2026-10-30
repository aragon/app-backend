import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type DAO_ENS, type ENS, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helper:EnsHelper' })

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

  async getEnsWithUniversalResolver(address: string): Promise<ENS | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      const name = await retryRequest(() =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(() =>
          provider.lookupAddress(address),
        ),
      )
      return (name as ENS | null) ?? null
    } catch (error) {
      if ((error as { reason?: string }).reason === 'ReverseAddressMismatch(string,bytes)') {
        logger.info('ENS forward resolution does not match address', llo({ address, error }))
        return null
      }
      throw error
    }
  },
}

export default EnsHelper
