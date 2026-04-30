import { throwExposable } from '@helpers/errors'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'
import { ErrorKeyEnum, type IDelegateStatement } from '@types'

const IpfsController = {
  getDelegateStatement: async (cid: string): Promise<IDelegateStatement> => {
    const data = await IPFSModule.fetchMetadata(cid, {
      retries: 2,
      timeout: 10000,
    })

    if (!data) {
      throwExposable(ErrorKeyEnum.notFound, 404, 'Delegate statement not found on IPFS')
    }

    const parsed = Web3Utils.parseDelegateStatement(data)

    if (!parsed.content) {
      throwExposable(ErrorKeyEnum.badParams, 422, 'IPFS content is not a valid delegate statement')
    }

    return parsed
  },
}

export default IpfsController
