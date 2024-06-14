export interface DaoResourceLink {
  name: string
  url: string
}

export interface IDaoMetadata {
  name?: string | null
  description?: string | null
  avatar?: string | null
  links?: DaoResourceLink[]
}

export interface IProposalMetadata {
  title?: string | null
  summary?: string | null
  description?: string | null
  resources?: Array<{
    url?: string
    name?: string
  }>
  media?: {
    header?: string | null
    logo?: string | null
  }
}

export interface IPermission {
  operation: number
  where: string
  who: string
  condition: string
  permissionId: string
}
