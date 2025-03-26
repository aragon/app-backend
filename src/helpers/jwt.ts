import koaJWT from 'koa-jwt'
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken'
import config from '@config'

const JwtHelper = {
  JWT_KEY: config.SERVICES.ARAGON_ADMIN_API.JWT_KEY,

  generateJWT(jwtData: string | Buffer | object, opts: SignOptions = {}): string {
    return jwt.sign(jwtData, config.SERVICES.ARAGON_ADMIN_API.JWT_SECRET, opts)
  },

  decodeJWT(token: string, opts = {}): string | JwtPayload {
    return jwt.verify(token, config.SERVICES.ARAGON_ADMIN_API.JWT_SECRET, opts)
  },

  readJWT: () =>
    koaJWT({
      secret: config.SERVICES.ARAGON_ADMIN_API.JWT_SECRET,
      passthrough: true,
      key: config.SERVICES.ARAGON_ADMIN_API.JWT_KEY,
    }),
}

export default JwtHelper
