import speakeasy from 'speakeasy'

const TwoFaHelper = {
  generateSecret(length = 20): speakeasy.GeneratedSecret {
    return speakeasy.generateSecret({ length })
  },

  verifyTOTP({
    secret,
    token,
    encoding = 'base32',
  }: {
    secret: string
    token: string
    encoding?: 'ascii' | 'hex' | 'base32'
  }): boolean {
    return speakeasy.totp.verify({
      secret,
      token,
      encoding,
    })
  },
}

export default TwoFaHelper

// const secret = TwoFaHelper.generateSecret()
// // Save `secret.base32` securely
//
// const isValid = TwoFaHelper.verifyTOTP({
//   secret: secret.base32,
//   token: '123456', // code from authenticator app
// })
