export interface IDelegateStatementItem {
  format: string
  title?: string
  content: string
}

export interface IDelegateStatementSingle {
  version: number
  type: 'statement'
  format: string
  content: string | IDelegateStatementItem
}

export interface IDelegateStatementMulti {
  version: number
  type: 'statements'
  content: IDelegateStatementItem[]
}

export type IDelegateStatement = IDelegateStatementSingle | IDelegateStatementMulti
