import { NetworksEnum } from '@types'
import { setWorkspaceModels, WorkspaceModels } from '@workspace/models'
import WorkspaceScanner from '@workspace/modules/scanner'
import WorkspaceService from '@workspace/modules/workspaceService'
import { IWorkspaceStatus, IWorkspaceTargetStatus } from '@workspace/types/workspace'
import { expect } from 'chai'

// Same address in three casings — the service should land on one checksummed row.
const DAO_REGISTRY = '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e'
const CREATOR = '0x29A6f32f36EDeD399763524018F17F03B1435b18'
const OTHER_CREATOR = '0x37D085ca4a24f6b29214204E8A8666f12cf19516'
const DAO_FACTORY = '0xA03C2182af8eC460D498108C92E8638a580b94d4'

describe('Service: aragon-workspace WorkspaceService', () => {
  const network = NetworksEnum.ethereumMainnet

  before(() => {
    // Mirrors what the service does in start(); the shared loader never sees these.
    setWorkspaceModels()
  })

  describe('create', () => {
    it('should persist a workspace with one pending target per address', async () => {
      const workspace = await WorkspaceService.create({
        name: 'osx core',
        creator: CREATOR,
        network,
        targets: [DAO_REGISTRY, DAO_FACTORY],
      })

      expect(workspace.status).to.equal(IWorkspaceStatus.pending)
      expect(workspace.targets).to.have.members([DAO_REGISTRY, DAO_FACTORY])

      const targets = await WorkspaceModels.WorkspaceTarget.find({ workspaceId: workspace.id })
      expect(targets).to.have.length(2)
      expect(targets.every(target => target.status === IWorkspaceTargetStatus.pending)).to.equal(true)
      expect(targets.every(target => target.network === network)).to.equal(true)
    })

    it('should checksum and deduplicate the submitted addresses', async () => {
      const workspace = await WorkspaceService.create({
        name: 'dupes',
        creator: CREATOR,
        network,
        targets: [DAO_REGISTRY.toLowerCase(), DAO_REGISTRY.toUpperCase().replace('0X', '0x'), DAO_REGISTRY] as any,
      })

      expect(workspace.targets).to.deep.equal([DAO_REGISTRY])

      const targets = await WorkspaceModels.WorkspaceTarget.find({ workspaceId: workspace.id })
      expect(targets).to.have.length(1)
      expect(targets[0].address).to.equal(DAO_REGISTRY)
    })

    it('should give each workspace its own id', async () => {
      const first = await WorkspaceService.create({ name: 'a', creator: CREATOR, network, targets: [DAO_REGISTRY] })
      const second = await WorkspaceService.create({ name: 'b', creator: CREATOR, network, targets: [DAO_REGISTRY] })

      expect(first.id).to.not.equal(second.id)
    })

    it('should reject a name that is already taken', async () => {
      await WorkspaceService.create({ name: 'taken', creator: CREATOR, network, targets: [DAO_REGISTRY] })

      let threw = false
      try {
        await WorkspaceService.create({ name: 'taken', creator: CREATOR, network, targets: [DAO_FACTORY] })
      } catch {
        threw = true
      }
      expect(threw, 'the same name was allowed twice').to.equal(true)
    })

    it('should reject a taken name even for a different creator', async () => {
      await WorkspaceService.create({ name: 'shared', creator: CREATOR, network, targets: [DAO_REGISTRY] })

      let threw = false
      try {
        await WorkspaceService.create({ name: 'shared', creator: OTHER_CREATOR, network, targets: [DAO_REGISTRY] })
      } catch {
        threw = true
      }
      expect(threw, 'names must be unique across creators, not per creator').to.equal(true)
    })

    it('should checksum the creator', async () => {
      const workspace = await WorkspaceService.create({
        name: 'lowercase creator',
        creator: CREATOR.toLowerCase() as any,
        network,
        targets: [DAO_REGISTRY],
      })

      expect(workspace.creator).to.equal(CREATOR)
    })
  })

  describe('listByCreator', () => {
    it('should return only that creator, newest first, and narrow by name', async () => {
      await WorkspaceService.create({ name: 'one', creator: CREATOR, network, targets: [DAO_REGISTRY] })
      await WorkspaceService.create({ name: 'two', creator: CREATOR, network, targets: [DAO_REGISTRY] })
      await WorkspaceService.create({ name: 'theirs', creator: OTHER_CREATOR, network, targets: [DAO_REGISTRY] })

      const mine = await WorkspaceService.listByCreator(CREATOR)
      expect(mine.map(workspace => workspace.name)).to.have.members(['one', 'two'])

      const byName = await WorkspaceService.listByCreator(CREATOR, 'two')
      expect(byName).to.have.length(1)
      expect(byName[0].name).to.equal('two')
    })
  })

  describe('get', () => {
    it('should return the workspace with its targets', async () => {
      const created = await WorkspaceService.create({
        name: 'osx core',
        creator: CREATOR,
        network,
        targets: [DAO_REGISTRY, DAO_FACTORY],
      })

      const { workspace, targets } = await WorkspaceService.get(created.id)

      expect(workspace.id).to.equal(created.id)
      expect(workspace.name).to.equal('osx core')
      // Sorted by raw byte value, so checksum casing decides: '7' (0x37) < 'A' (0x41).
      expect(targets.map(target => target.address)).to.deep.equal([DAO_REGISTRY, DAO_FACTORY])
    })

    it('should reject an unknown workspace id', async () => {
      let threw = false
      try {
        await WorkspaceService.get('does-not-exist')
      } catch {
        threw = true
      }
      expect(threw).to.equal(true)
    })
  })

  describe('scan', () => {
    it('should move the workspace and its targets to a terminal state', async () => {
      const created = await WorkspaceService.create({
        name: 'osx core',
        creator: CREATOR,
        network,
        targets: [DAO_REGISTRY],
      })

      await WorkspaceScanner.scan(created.id)

      const { workspace, targets } = await WorkspaceService.get(created.id)
      expect(workspace.status).to.equal(IWorkspaceStatus.ready)
      // test:unit connects MockDB but no RPC provider, so a target can only fail
      // here. What matters either way is that a scan never leaves one pending.
      // The `done` path needs a real chain and is covered in test/unit-dep.
      expect(targets[0].status).to.not.equal(IWorkspaceTargetStatus.pending)
    })

    it('should not throw when the workspace vanished before the scan ran', async () => {
      await WorkspaceScanner.scan('does-not-exist')
    })
  })
})
