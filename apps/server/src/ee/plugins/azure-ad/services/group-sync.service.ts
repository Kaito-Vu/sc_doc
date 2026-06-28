import { Injectable, Logger } from '@nestjs/common'

export interface GraphGroup {
  id: string
  displayName: string
  mailNickname?: string
}

export interface GroupSyncResult {
  groupIds: string[]
  mappedRoles: string[]
}

@Injectable()
export class GroupSyncService {
  private readonly logger = new Logger(GroupSyncService.name)
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000
  private readonly GRAPH_API_TIMEOUT = 10000

  async fetchUserGroups(accessToken: string): Promise<GraphGroup[]> {
    const groups: GraphGroup[] = []
    let nextLink: string | undefined = 'https://graph.microsoft.com/v1.0/me/memberOf'

    while (nextLink) {
      try {
        const response = await this.fetchWithRetry(nextLink, accessToken)
        const data = (await response.json()) as Record<string, any>

        if (data.value && Array.isArray(data.value)) {
          // Filter to only group results
          const groupResults = data.value.filter(
            (item: any) => item['@odata.type'] === '#microsoft.graph.group'
          )
          groups.push(...groupResults)
        }

        nextLink = data['@odata.nextLink']
      } catch (error) {
        this.logger.error('Failed to fetch user groups:', error)
        break
      }
    }

    return groups
  }

  private async fetchWithRetry(
    url: string,
    accessToken: string,
    attempt = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.GRAPH_API_TIMEOUT),
      })

      if (!response.ok) {
        if (response.status === 429 && attempt < this.MAX_RETRIES) {
          const retryAfter = response.headers.get('retry-after')
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : this.RETRY_DELAY_MS * Math.pow(2, attempt)

          this.logger.warn(`Rate limited, retrying after ${delay}ms (attempt ${attempt + 1})`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          return this.fetchWithRetry(url, accessToken, attempt + 1)
        }
        throw new Error(`Graph API error: ${response.status}`)
      }

      return response
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Graph API request timeout')
      }
      throw error
    }
  }

  mapGroupsToRoles(
    groups: GraphGroup[],
    mappingRules?: Record<string, string>
  ): string[] {
    if (!mappingRules || !groups.length) {
      return []
    }

    const roles = new Set<string>()

    for (const group of groups) {
      const mappedRole = mappingRules[group.id]
      if (mappedRole) {
        roles.add(mappedRole)
      }
    }

    return Array.from(roles)
  }

  filterGroupsByNames(
    groups: GraphGroup[],
    filterNames?: string[]
  ): GraphGroup[] {
    if (!filterNames || filterNames.length === 0) {
      return groups
    }

    return groups.filter((group) =>
      filterNames.includes(group.displayName)
    )
  }

  syncGroupsResult(
    groups: GraphGroup[],
    mappingRules?: Record<string, string>,
    filterNames?: string[]
  ): GroupSyncResult {
    const filtered = this.filterGroupsByNames(groups, filterNames)
    const mappedRoles = this.mapGroupsToRoles(filtered, mappingRules)

    return {
      groupIds: filtered.map((g) => g.id),
      mappedRoles,
    }
  }
}
