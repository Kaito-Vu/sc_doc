import { Test, TestingModule } from '@nestjs/testing'
import { GroupSyncService, GraphGroup } from '../services/group-sync.service'

describe('GroupSyncService', () => {
  let service: GroupSyncService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupSyncService],
    }).compile()

    service = module.get<GroupSyncService>(GroupSyncService)
  })

  describe('mapGroupsToRoles', () => {
    it('should map groups to roles correctly', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
        { id: 'group-3', displayName: 'Viewers' },
      ]

      const mappingRules = {
        'group-1': 'workspace-admin',
        'group-2': 'workspace-member',
        'group-3': 'workspace-viewer',
      }

      const roles = service.mapGroupsToRoles(groups, mappingRules)

      expect(roles).toContain('workspace-admin')
      expect(roles).toContain('workspace-member')
      expect(roles).toContain('workspace-viewer')
      expect(roles.length).toBe(3)
    })

    it('should handle partial mapping', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
        { id: 'group-3', displayName: 'Others' },
      ]

      const mappingRules = {
        'group-1': 'workspace-admin',
        'group-2': 'workspace-member',
      }

      const roles = service.mapGroupsToRoles(groups, mappingRules)

      expect(roles).toContain('workspace-admin')
      expect(roles).toContain('workspace-member')
      expect(roles.length).toBe(2)
    })

    it('should return empty array for no mappings', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
      ]

      const roles = service.mapGroupsToRoles(groups, {})

      expect(roles).toEqual([])
    })

    it('should deduplicate roles', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Super Admins' },
      ]

      const mappingRules = {
        'group-1': 'workspace-admin',
        'group-2': 'workspace-admin',
      }

      const roles = service.mapGroupsToRoles(groups, mappingRules)

      expect(roles).toEqual(['workspace-admin'])
      expect(roles.length).toBe(1)
    })
  })

  describe('filterGroupsByNames', () => {
    it('should filter groups by display names', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
        { id: 'group-3', displayName: 'Viewers' },
      ]

      const filtered = service.filterGroupsByNames(groups, ['Admins', 'Members'])

      expect(filtered.length).toBe(2)
      expect(filtered[0].displayName).toBe('Admins')
      expect(filtered[1].displayName).toBe('Members')
    })

    it('should return all groups if no filters provided', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
      ]

      const filtered = service.filterGroupsByNames(groups, [])

      expect(filtered).toEqual(groups)
    })

    it('should return empty array for non-matching filters', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
      ]

      const filtered = service.filterGroupsByNames(groups, [
        'NonExistent',
        'AlsoNotThere',
      ])

      expect(filtered).toEqual([])
    })
  })

  describe('syncGroupsResult', () => {
    it('should sync groups with filters and mappings', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
        { id: 'group-3', displayName: 'Viewers' },
      ]

      const mappingRules = {
        'group-1': 'workspace-admin',
        'group-2': 'workspace-member',
      }

      const filterNames = ['Admins', 'Members']

      const result = service.syncGroupsResult(groups, mappingRules, filterNames)

      expect(result.groupIds).toEqual(['group-1', 'group-2'])
      expect(result.mappedRoles).toContain('workspace-admin')
      expect(result.mappedRoles).toContain('workspace-member')
    })

    it('should handle no mappings', () => {
      const groups: GraphGroup[] = [
        { id: 'group-1', displayName: 'Admins' },
        { id: 'group-2', displayName: 'Members' },
      ]

      const result = service.syncGroupsResult(groups)

      expect(result.groupIds).toEqual(['group-1', 'group-2'])
      expect(result.mappedRoles).toEqual([])
    })
  })
})
