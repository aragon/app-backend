import { NetworksEnum } from '@types'
import WorkspaceConfig from '@workspace/config'
import AccessControlDetector from '@workspace/helpers/accessControlDetector'
import { IAccessControlGuardRequirement, IAccessControlScheme } from '@workspace/types/accessControl'
import { expect } from 'chai'
import { AbiCoder, id, ZeroAddress, ZeroHash } from 'ethers'
import sinon from 'sinon'

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

  describe('_readRoleMembers', () => {
    const HOLDER = '0x29A6f32f36EDeD399763524018F17F03B1435b18'
    const TARGET = '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e'

    /** Answers the count call with `count`, then every member call with HOLDER. */
    const stubCalls = (count: number) => {
      let first = true
      return sinon.stub(AccessControlDetector, '_staticCall').callsFake(async () => {
        if (first) {
          first = false
          return abiCoder.encode(['uint256'], [count])
        }
        return abiCoder.encode(['address'], [HOLDER])
      })
    }

    afterEach(() => sinon.restore())

    it('should enumerate every member when the count is sane', async () => {
      const staticCall = stubCalls(3)

      const members = await AccessControlDetector._readRoleMembers(
        {} as any,
        TARGET as any,
        NetworksEnum.ethereumMainnet,
        MINTER_ROLE,
      )

      expect(members).to.have.length(3)
      // One count call plus one per member.
      expect(staticCall.callCount).to.equal(4)
    })

    it('should not let the scanned contract dictate how much we allocate', async () => {
      // A hostile target answering with a billion members would otherwise build a
      // billion promises and queue that many calls.
      const staticCall = stubCalls(1_000_000_000)

      const members = await AccessControlDetector._readRoleMembers(
        {} as any,
        TARGET as any,
        NetworksEnum.ethereumMainnet,
        MINTER_ROLE,
      )

      expect(members).to.have.length(WorkspaceConfig.MAX_ROLE_MEMBERS)
      expect(staticCall.callCount).to.equal(WorkspaceConfig.MAX_ROLE_MEMBERS + 1)
    })

    it('should read nothing when the count is not a usable number', async () => {
      sinon.stub(AccessControlDetector, '_staticCall').resolves(abiCoder.encode(['uint256'], [0]))

      const members = await AccessControlDetector._readRoleMembers(
        {} as any,
        TARGET as any,
        NetworksEnum.ethereumMainnet,
        MINTER_ROLE,
      )

      expect(members).to.deep.equal([])
    })
  })
})
