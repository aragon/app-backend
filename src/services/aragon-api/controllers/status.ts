import config from '@config'
import dayjs from '@helpers/dayjs'
import * as packageJson from '@package'
import { type IStatusResponse } from '@types'
import { NetworkHelper } from '@helpers/network'

const StatusController = {
  getStatus: (): IStatusResponse => ({
    status: 'healthy',
    appName: config.APP_NAME,
    nodeVersion: process.version,
    environment: config.ENVIRONMENT,
    supportedNetworks: NetworkHelper.supportedNetworks().map(network => network.networkName),
    appVersionPackage: packageJson.version,
    time: dayjs().format(),
  }),
}

export default StatusController
