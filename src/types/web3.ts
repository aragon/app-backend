export interface BatchRequestItem {
  method: string
  params: any[]
  identifier: any
}

export interface BatchResponse<T> {
  identifier: any
  success: boolean
  data: T | null
  error?: any
}
