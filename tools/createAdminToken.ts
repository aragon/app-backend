import { EnumConnection, IJwtTokenType, type IService } from '@types'
import AuthMiddleware from '@middlewares/auth'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'tool:CreateAdminToken' })

export const CreateAdminToken: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    const token = await AuthMiddleware.generateJwtAuth(IJwtTokenType.admin)
    logger.verbose('Admin token created', llo({ token }))
  },

  stop: async () => {},
}

export default CreateAdminToken
