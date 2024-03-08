import { type INetworks } from './networks'

export interface IStatusResponse {
  status: string
  appName: string
  nodeVersion: string
  environment: string
  supportedNetworks: INetworks[]
  appVersionPackage: string
  time: string
}
