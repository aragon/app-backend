import { Models } from '@dbModels'
import { ErrorKey, type HexAddress, type NetworksEnum } from '@types'
import { type IToken } from '@src/types/token'
import CovalentHelper from '@helpers/covalent'
import { assertExposable } from '@errors'

const TokenController = {
  getTokenByAddressAndNetwork: async(params: {
    address: HexAddress
    network: NetworksEnum
  }): Promise<IToken> => {
    let token = await Models.Token.findByTokenAddressAndNetwork(
      params.address,
      params.network,
    )

    if (!token) {
      const cToken = await CovalentHelper.getToken(
        params.address,
        params.network,
      )
      assertExposable(!!cToken, ErrorKey.notFound, undefined, undefined, params)
      token = await Models.Token.create(cToken)
    }

    return token
  },
}

export default TokenController
