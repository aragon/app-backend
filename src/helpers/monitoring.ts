import * as Toobusy from 'toobusy-js'
import logger from '@logger'
import { ErrorKey, type ITooBusyConfig } from '@types'

const tooBusyConfig: ITooBusyConfig = {
  maxLag: 600, // Maximum lag threshold in milliseconds
  interval: 2000, // Interval in milliseconds (2 seconds)
}

function initializeTooBusy({ maxLag, interval }: ITooBusyConfig): void {
  Toobusy.maxLag(maxLag)
  Toobusy.interval(interval)

  const handleLag = (currentLag: number): void => {
    logger.warn(ErrorKey.tooBusy, { currentLag })
  }

  Toobusy.onLag(handleLag)
}

initializeTooBusy(tooBusyConfig)

export default Toobusy
