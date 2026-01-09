import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import TwoFaHelper from '@helpers/2fa'
import JwtHelper from '@helpers/jwt'
import type { RouterContext } from '@koa/router'
import { ErrorKeyEnum, IJwtAuthType, IJwtTokenType } from '@types'
import { type SignOptions } from 'jsonwebtoken'
import type { Next } from 'koa'
import type { SaveOptions } from 'mongoose'

const AuthMiddleware = {
  _generateJWTLogin(tokenValue: string, userAgent: string | null, tokenType: IJwtTokenType, opts: SignOptions = {}) {
    return JwtHelper.generateJWT(
      {
        auth: `aragon-${tokenType}`,
        agent: userAgent || null,
        token: tokenValue,
      },
      opts,
    )
  },

  async generateJwtAuth(type: IJwtTokenType, tOpts?: SaveOptions): Promise<string> {
    const secret = TwoFaHelper.generateSecret(20)
    const token = await Models.Jwt.create({ value: secret.base32, type: IJwtAuthType.auth }, tOpts)
    return AuthMiddleware._generateJWTLogin(token.value, null, type)
  },

  authAssertAdmin: () => async (ctx: RouterContext, next: Next) => {
    const tokenValue = ctx.state[JwtHelper.JWT_KEY] ? ctx.state[JwtHelper.JWT_KEY].token : null
    assertExposable(!!tokenValue, ErrorKeyEnum.accessDenied)

    const token = ctx.state.token || (await Models.Jwt.findByValue(tokenValue))
    assertExposable(!!token || token?.type !== IJwtTokenType.admin, ErrorKeyEnum.accessDenied)

    // const tokenExpired = moment(token.updatedAt).isBefore(moment().subtract({ days: CONFIG.SERVICES.API.SESSION_EXPIRATION_DAY }))
    // if (tokenExpired) {
    //   await token.deleteOne()
    //   assertExposable(!tokenExpired, ErrorKeyEnum.tokenExpired)
    // }
    await token.updateOnly()
    ctx.state.token = token

    return next()
  },
}

export default AuthMiddleware
