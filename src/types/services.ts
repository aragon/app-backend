export interface IService {
  NEED_CONNECTIONS: string[]

  start: () => Promise<any>

  stop: () => void
}
