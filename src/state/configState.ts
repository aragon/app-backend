import { type WebSocketProvider } from 'ethers'
import { EventEmitter } from 'events'

export type IConfigState = Record<string, any>

export enum ConfigEvents {
  CONFIG_UPDATED = 'CONFIG_UPDATED',
  CONFIG_ITEM_REMOVED = 'CONFIG_ITEM_REMOVED',
}

/**
 * ConfigState is a singleton class that manages the application configuration.
 * It extends EventEmitter to allow other parts of the application to listen for config updates.
 */
export class ConfigState extends EventEmitter {
  static instance: ConfigState
  config: IConfigState = {}

  private constructor() {
    super()
  }

  public static getInstance(): ConfigState {
    if (!ConfigState.instance) {
      ConfigState.instance = new ConfigState()
    }
    return ConfigState.instance
  }

  public setConfigItem(key: string, value: any): void {
    this.config[key] = value
    this.emit(ConfigEvents.CONFIG_UPDATED, { key, value })
  }

  public removeConfigItem(key: string): void {
    if (this.config[key] !== undefined) {
      const removedValue = this.config[key]
      delete this.config[key]
      this.emit(ConfigEvents.CONFIG_ITEM_REMOVED, { key, value: removedValue })
    }
  }

  public getConfigItem(key: string): WebSocketProvider | any {
    return this.config[key]
  }

  public getAllConfigItems(): IConfigState {
    return { ...this.config }
  }

  public addConfigListener(event: ConfigEvents, callback: (data: { key: string; value: any }) => void): void {
    this.on(event, callback)
  }

  public removeConfigListener(event: ConfigEvents, callback: (data: { key: string; value: any }) => void): void {
    this.off(event, callback)
  }
}
