import { type IAssessmentContext } from '@types'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * What an address is to this DAO, in the words a finding uses: the DAO itself, one of its
 * plugins, a contract whose verified source gives it a name, or the address alone. It never
 * calls something a contract or a wallet, since nothing here establishes which it is.
 */
export const nameOf = (address: string, ctx: Readonly<IAssessmentContext>, verifiedName?: string | null): string => {
  if (address === ZERO) return 'nobody'
  if (address === ctx.request.daoAddress) return 'the DAO'
  const plugin = ctx.plugins.find(p => p.address === address)
  if (plugin) return `the ${plugin.interfaceType} plugin ${address}`
  return verifiedName ? `${verifiedName} at ${address}` : address
}
