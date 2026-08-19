import AccessControlDetector from '@workspace/helpers/accessControlDetector'
import { IAccessControlGuardRequirement, IAccessControlScheme } from '@workspace/types/accessControl'
import { expect } from 'chai'
import { AbiCoder, ZeroAddress, ZeroHash, id } from 'ethers'

const abiCoder = AbiCoder.defaultAbiCoder()

const OWNABLE = ['owner()', 'transferOwnership(address)']
const OWNABLE_2_STEP = ['pendingOwner()', 'acceptOwnership()']
const ACCESS_CONTROL = ['hasRole(bytes32,address)', 'getRoleAdmin(bytes32)']
const ENUMERABLE = ['getRoleMember(bytes32,uint256)', 'getRoleMemberCount(bytes32)']
const ACCESS_MANAGED = ['authority()', 'setAuthority(address)']

const MINTER_ROLE = id('MINTER_ROLE')

/** Revert data as the node returns it: 4-byte selector followed by abi-encoded args. */
const revertWith = (selector: string, types: string[], values: unknown[]) => ({
  data: `${selector}${abiCoder.encode(types, values).slice(2)}`,
})

const errorString = (message: string) => revertWith('0x08c379a0', ['string'], [message])

describe('Service: aragon-workspace AccessControlDetector', () => {
  describe('_fingerprintSchemes', () => {
    const fingerprint = (signatures: string[]) => AccessControlDetector._fingerprintSchemes(new Set(signatures))

    it('should detect ownable on its own', () => {
      expect(fingerprint(OWNABLE)).to.deep.equal([IAccessControlScheme.ownable])
    })

    it('should detect ownable2Step only alongside ownable', () => {
      expect(fingerprint([...OWNABLE, ...OWNABLE_2_STEP])).to.deep.equal([
        IAccessControlScheme.ownable,
        IAccessControlScheme.ownable2Step,
      ])
      // The two-step half without the base is not Ownable2Step
      expect(fingerprint(OWNABLE_2_STEP)).to.deep.equal([])
    })

    it('should detect accessControl and its enumerable extension', () => {
      expect(fingerprint(ACCESS_CONTROL)).to.deep.equal([IAccessControlScheme.accessControl])
      expect(fingerprint([...ACCESS_CONTROL, ...ENUMERABLE])).to.deep.equal([
        IAccessControlScheme.accessControl,
        IAccessControlScheme.accessControlEnumerable,
      ])
    })

    it('should detect several schemes on one contract', () => {
      expect(fingerprint([...OWNABLE, ...ACCESS_CONTROL, ...ACCESS_MANAGED])).to.deep.equal([
        IAccessControlScheme.ownable,
        IAccessControlScheme.accessControl,
        IAccessControlScheme.accessManaged,
      ])
    })

    it('should return nothing for a contract with no access control', () => {
      expect(fingerprint(['transfer(address,uint256)', 'balanceOf(address)'])).to.deep.equal([])
    })

    it('should require every signature of a scheme, not just one', () => {
      expect(fingerprint(['owner()'])).to.deep.equal([])
      expect(fingerprint(['hasRole(bytes32,address)'])).to.deep.equal([])
    })
  })

  describe('_classifyRevert', () => {
    it('should read the role out of an OZ v5 AccessControlUnauthorizedAccount', () => {
      const error = revertWith('0xe2517d3f', ['address', 'bytes32'], [ZeroAddress, MINTER_ROLE])

      expect(AccessControlDetector._classifyRevert(error)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.role,
        role: MINTER_ROLE,
      })
    })

    it('should classify an OZ v5 OwnableUnauthorizedAccount as owner', () => {
      const error = revertWith('0x118cdaa7', ['address'], [ZeroAddress])

      expect(AccessControlDetector._classifyRevert(error)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.owner,
        role: null,
      })
    })

    it('should classify an OZ v5 AccessManagedUnauthorized as authority', () => {
      const error = revertWith('0x068ca9d8', ['address'], [ZeroAddress])

      expect(AccessControlDetector._classifyRevert(error)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.authority,
        role: null,
      })
    })

    it('should classify the OZ v4 ownable revert string as owner', () => {
      const error = errorString('Ownable: caller is not the owner')

      expect(AccessControlDetector._classifyRevert(error)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.owner,
        role: null,
      })
    })

    it('should read the role out of the OZ v4 access control revert string', () => {
      const error = errorString(`AccessControl: account ${ZeroAddress} is missing role ${MINTER_ROLE}`)

      expect(AccessControlDetector._classifyRevert(error)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.role,
        role: MINTER_ROLE,
      })
    })

    it('should stay unknown for an unrelated revert', () => {
      // An unrelated require firing before the modifier looks exactly like this,
      // so it must read as "could not tell", never as "no guard".
      expect(
        AccessControlDetector._classifyRevert(errorString('ERC20: transfer amount exceeds balance')),
      ).to.deep.equal({
        requirement: IAccessControlGuardRequirement.unknown,
        role: null,
      })
      expect(AccessControlDetector._classifyRevert(revertWith('0xdeadbeef', ['uint256'], [1]))).to.deep.equal({
        requirement: IAccessControlGuardRequirement.unknown,
        role: null,
      })
    })

    it('should stay unknown when the error carries no revert data', () => {
      expect(AccessControlDetector._classifyRevert(new Error('network timeout'))).to.deep.equal({
        requirement: IAccessControlGuardRequirement.unknown,
        role: null,
      })
      expect(AccessControlDetector._classifyRevert(undefined)).to.deep.equal({
        requirement: IAccessControlGuardRequirement.unknown,
        role: null,
      })
    })

    it('should find revert data however deeply the provider nested it', () => {
      const payload = revertWith('0xe2517d3f', ['address', 'bytes32'], [ZeroAddress, ZeroHash]).data
      const expected = { requirement: IAccessControlGuardRequirement.role, role: ZeroHash }

      expect(AccessControlDetector._classifyRevert({ info: { error: { data: payload } } })).to.deep.equal(expected)
      expect(AccessControlDetector._classifyRevert({ error: { data: payload } })).to.deep.equal(expected)
    })

    it('should still report a role requirement when the payload will not decode', () => {
      // Truncated args — the selector is trustworthy even when the rest is not.
      expect(AccessControlDetector._classifyRevert({ data: '0xe2517d3f0badc0de' })).to.deep.equal({
        requirement: IAccessControlGuardRequirement.role,
        role: null,
      })
    })
  })
})
