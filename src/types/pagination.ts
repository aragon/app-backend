export interface IPaginationParams {
  search?: string
  fromDate?: string
  toDate?: string
  limit?: number
  skip?: number
  order?: string
  orderProp?: string
}

export interface IPaginationMetadata {
  search?: string
  totRecords: number
  limit?: number
  skip?: number
  order?: string
  orderProp?: string
  currentPage: number
  totPages: number
}

export interface IPaginatedResult<T> {
  data: T[]
  metadata: IPaginationMetadata
}
