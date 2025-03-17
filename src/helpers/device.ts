import parser from 'ua-parser-js'
import logger from '@logger'
import { assert } from '@errors'
import { type IDeviceInfo } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:device' })

const DeviceInfo = {
  getDeviceInfo(userAgent?: string): IDeviceInfo {
    const info: IDeviceInfo = {} as IDeviceInfo // eslint-disable-line

    try {
      assert(!!userAgent, 'userAgent empty', { userAgent })
      const data: any = parser.UAParser(userAgent)

      info.ua = data.ua
      info.type = data?.device?.type ?? 'web'
      info.name = data?.device?.model || data?.browser?.name || 'web'
      info.vendor = data?.device?.vendor || 'web'
      info.version = data?.browser?.version
    } catch (error) {
      logger.error('Impossible to get device info', llo({ error }))
    }

    return info
  },
}

export default DeviceInfo
