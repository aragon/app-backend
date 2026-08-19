import { type HexAddress, NetworksEnum } from '@types'
import { setWorkspaceModels, WorkspaceModels } from '@workspace/models'
import WorkspaceScanner from '@workspace/modules/scanner'
import WorkspaceService from '@workspace/modules/workspaceService'
import { IAccessControlScheme } from '@workspace/types/accessControl'
import { IWorkspaceAccountType, IWorkspaceStatus, IWorkspaceTargetStatus } from '@workspace/types/workspace'
import { expect } from 'chai'
import { getAddress, ZeroHash } from 'ethers'

/**
 * Real mainnet contracts, real RPC, real explorer, no stubs.
 *
 * One `it` on purpose: the harness drops the database before every test, so a
 * second block would have to redo the whole scan — explorer lookups, probes and
 * all — to assert one more thing. Everything is checked off a single scan.
 *
 * Fixtures came from querying our own Contract table for verified 0.8.x ABIs
 * holding the OZ signatures, then confirming each on-chain, rather than assuming
 * which contracts use OZ:
 *
 *   SlashingManager    real OZ v5 AccessControl (v0.8.28, custom-error reverts),
 *                      NOT enumerable — the only shape that forces the log replay
 *                      to run, since members cannot be read any other way
 *   SponsorshipQueue   small pure Ownable, v0.8.33
 *
 * Run with:
 *   ENVIO_API_TOKEN="$(get_env aragon envi)" \
 *   NODE_OPTIONS="-r ./.claude/opEnv.js --max-old-space-size=8192" \
 *   TS_NODE_TRANSPILE_ONLY=true pnpm test:unit-dep
 */
describe('Integ: aragon-workspace', () => {
  const network = NetworksEnum.ethereumMainnet

  // Ownable + AccessControl on one contract; roles are not enumerable.
  const SLASHING_MANAGER = '0x974E865B1BB24AF2a9ef8204AdEA9251Cc7C5FD9' as HexAddress
  // Pure Ownable, small.
  const SPONSORSHIP_QUEUE = '0xd0F6F372Ae2b640AE3b3875100Ce301d66f74607' as HexAddress
  // Nothing has ever been deployed here. A funded EOA is NOT a safe fixture:
  // under EIP-7702 a delegated account carries a 23-byte designator, so getCode
  // answers for it and it reads as a contract.
  const NO_CODE = '0x00000000000000000000000000000000000Ac0DE' as HexAddress

  before(() => {
    setWorkspaceModels()
  })

  it('should scan a workspace and report who can call what', async function () {
    this.timeout(900000)

    const created = await WorkspaceService.create({
      name: 'poc',
      creator: '0x29A6f32f36EDeD399763524018F17F03B1435b18' as HexAddress,
      network,
      targets: [SLASHING_MANAGER, SPONSORSHIP_QUEUE, NO_CODE],
    })

    await WorkspaceScanner.scan(created.id)

    const { workspace, targets } = await WorkspaceService.get(created.id)
    const byAddress = new Map(targets.map(target => [target.address, target]))
    const roleToken = byAddress.get(SLASHING_MANAGER)!
    const ownableToken = byAddress.get(SPONSORSHIP_QUEUE)!

    // ── the scan completed and classified every target ──────────────────────
    expect(workspace.status).to.equal(IWorkspaceStatus.ready)
    expect(roleToken.status).to.equal(IWorkspaceTargetStatus.done)
    expect(ownableToken.status).to.equal(IWorkspaceTargetStatus.done)
    expect(byAddress.get(NO_CODE)!.status).to.equal(IWorkspaceTargetStatus.notAContract)

    // ── schemes came out of the ABI fingerprint ─────────────────────────────
    expect(roleToken.schemes).to.include(IAccessControlScheme.accessControl)
    // Not enumerable, so its role members cannot be read and the replay must run.
    expect(roleToken.schemes).to.not.include(IAccessControlScheme.accessControlEnumerable)
    // It exposes owner() but not transferOwnership(address), so it is not Ownable
    // by the fingerprint — both signatures are required, and that is deliberate.
    expect(roleToken.schemes).to.not.include(IAccessControlScheme.ownable)

    expect(ownableToken.schemes).to.deep.equal([IAccessControlScheme.ownable])

    // ── owner is a live read, independent of the ownable fingerprint ───────
    for (const target of [roleToken, ownableToken]) {
      expect(target.owner, `owner() did not answer for ${target.address}`).to.be.a('string')
      expect(getAddress(target.owner!)).to.equal(target.owner)
    }

    // ── gates: only gated requirements, each with selectors and holders ─────
    expect(roleToken.gates.length, 'no gates on a role-gated contract').to.be.greaterThan(0)

    for (const gate of roleToken.gates) {
      expect(['role', 'owner', 'authority'], 'none/unknown must never be stored').to.include(gate.requirement)
      expect(gate.selectors.length, 'a gate with no selectors should not exist').to.be.greaterThan(0)

      for (const { selector, signature } of gate.selectors) {
        expect(selector).to.match(/^0x[0-9a-f]{8}$/i)
        expect(signature).to.be.a('string')
      }

      if (gate.requirement === 'role') {
        expect(gate.role).to.match(/^0x[0-9a-f]{64}$/i)
      }

      // Every holder is checksummed and resolved to what it actually is.
      for (const holder of gate.holders) {
        expect(getAddress(holder.address)).to.equal(holder.address)
        expect(Object.values(IWorkspaceAccountType)).to.include(holder.type)
      }
    }

    // Selectors demanding the same thing collapse into one gate. Inferred and
    // probed gates stay apart, so the key must include it exactly as the scanner does.
    const gateKeys = roleToken.gates.map(gate => `${gate.requirement}:${gate.role ?? ''}:${gate.inferred}`)
    expect(new Set(gateKeys).size, 'duplicate gates for one requirement').to.equal(gateKeys.length)

    // This contract is NOT enumerable, so its role members cannot be read —
    // a role gate with holders can only have come from the log replay.
    const withHolders = roleToken.gates.filter(gate => gate.requirement === 'role' && gate.holders.length > 0)
    expect(withHolders.length, 'no role gate resolved to a holder, so the replay found nothing').to.be.greaterThan(0)

    expect(
      roleToken.gates.some(gate => gate.requirement === 'role'),
      'no role gate',
    ).to.equal(true)

    // DEFAULT_ADMIN_ROLE is synthesised whether or not a getter exposes it, so
    // if it gates anything here it must carry its name.
    const adminGate = roleToken.gates.find(gate => gate.role === ZeroHash)
    if (adminGate) expect(adminGate.roleName).to.equal('DEFAULT_ADMIN_ROLE')

    // Named roles survive; constants like DOMAIN_SEPARATOR do not.
    for (const gate of roleToken.gates) {
      if (!gate.roleName) continue
      expect(gate.roleName === 'DEFAULT_ADMIN_ROLE' || gate.roleName.endsWith('_ROLE')).to.equal(true)
    }

    // ── capabilities: the same thing per account ────────────────────────────
    const capabilities = await WorkspaceModels.WorkspaceCapability.find({ workspaceId: created.id })
    expect(capabilities.length, 'no capabilities resolved').to.be.greaterThan(0)

    const accountTypes = new Set(Object.values(IWorkspaceAccountType))
    const scanned = new Set(targets.map(target => target.address))

    for (const capability of capabilities) {
      expect(accountTypes.has(capability.accountType)).to.equal(true)
      expect(scanned.has(capability.target)).to.equal(true)
      expect(getAddress(capability.account)).to.equal(capability.account)
      expect(capability.selector).to.match(/^0x[0-9a-f]{8}$/i)
      expect(capability.viaRole === null || /^0x[0-9a-f]{64}$/i.test(capability.viaRole)).to.equal(true)
    }

    // Every capability traces back to a gate that names the same holder.
    for (const capability of capabilities) {
      const gates = byAddress.get(capability.target)!.gates
      const source = gates.find(
        gate =>
          gate.holders.some(holder => holder.address === capability.account) &&
          gate.selectors.some(s => s.selector === capability.selector),
      )
      expect(source, `capability ${capability.selector} has no gate behind it`).to.exist
      // The gate and the capability agree on what the account is.
      const holder = source!.holders.find(h => h.address === capability.account)!
      expect(capability.accountType).to.equal(holder.type)
    }

    // ── re-running replaces rows rather than doubling them ──────────────────
    const before = capabilities.length
    await WorkspaceScanner.scan(created.id)
    const after = await WorkspaceModels.WorkspaceCapability.countDocuments({ workspaceId: created.id })
    expect(after).to.equal(before)
  })
})
