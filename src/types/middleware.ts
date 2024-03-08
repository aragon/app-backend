import type Koa from 'koa'

export interface IUtilMiddleware {
  noop: (ctx: Koa.Context, next: Koa.Next) => Promise<void>
  onBodyParserError: (error: any) => void
}
