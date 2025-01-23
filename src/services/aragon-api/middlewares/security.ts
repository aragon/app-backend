import type Koa from 'koa'

const securityMiddleware = () => async (ctx: Koa.Context, next: Koa.Next) => {
  ctx.response.set('Access-Control-Allow-Origin', '*')
  ctx.response.set('referrer-policy', 'no-referrer')
  ctx.response.set('x-content-type-options', 'nosniff')
  ctx.response.set('x-frame-options', 'DENY')
  ctx.response.set('content-security-policy', "default-src 'self' https:")
  ctx.response.set('x-xss-protection', '1; mode=block')
  ctx.response.set('strict-transport-security', 'max-age=2592000; includeSubDomains')
  ctx.response.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, X-Requested-With')

  return await next()
}

export default securityMiddleware
