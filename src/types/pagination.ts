export interface IPaginationParams {
  search?: string
  startDate?: string
  endDate?: string
  pageSize?: number
  page?: number
  order?: string // the property to order by
  sort?: string // asc or desc
}

export interface IPaginationMetadata {
  currentPage: number
  totalPages: number
  totalRecords: number
}

export interface IPaginatedResult<T> {
  data: T[]
  metadata: IPaginationMetadata
}
