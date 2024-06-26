export interface I4ByteApiResponse {
  count: number
  next: string | null
  previous: string | null
  results: ISignatureRecord[]
}

export interface ISignatureRecord {
  id: number
  created_at: string
  text_signature: string
  hex_signature: string
  bytes_signature: string
}
