import logger from '@logger'
import { ErrorKeyEnum } from '@types'
import Toobusy from 'toobusy-js'

export class TooBusyMonitor {
  public maxLag: number // Maximum lag threshold in milliseconds
  public interval: number // Interval in milliseconds (2 seconds)

  constructor(maxLag: number = 600, interval: number = 2000) {
    this.maxLag = maxLag
    this.interval = interval
  }

  public init = (): void => {
    Toobusy.maxLag(this.maxLag)
    Toobusy.interval(this.interval)
    Toobusy.onLag(this.handleLag)
  }

  public handleLag = (currentLag: number): void => {
    logger.warn(ErrorKeyEnum.tooBusy, { currentLag })
  }
}

export default TooBusyMonitor
