import { Models } from '@dbModels'
import { ErrorKeyEnum, type HexAddress, type NetworksEnum } from '@types'
import { type IToken } from '@src/types/token'
import CovalentHelper from '@helpers/covalent'
import { assertExposable } from '@errors'
import dayjs from '@helpers/dayjs'

const TokenController = {
  getTokenByAddressAndNetwork: async (params: { address: HexAddress; network: NetworksEnum }): Promise<IToken> => {
    let token = await Models.Token.findByTokenAddressAndNetwork(params.address, params.network)

    if (!token) {
      const cToken = await CovalentHelper.getToken(params.address, params.network)
      assertExposable(!!cToken, ErrorKeyEnum.notFound, undefined, undefined, params)
      token = await Models.Token.create({
        ...cToken,
        lastUpdatedAt: dayjs().utc().toDate(),
      })
    }

    return token.filterKeys()
  },
}

export default TokenController
