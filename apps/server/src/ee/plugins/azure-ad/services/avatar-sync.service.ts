import { Injectable, Logger } from '@nestjs/common'

export interface AvatarSyncResult {
  photoUrl?: string
  photoBase64?: string
  synced: boolean
}

@Injectable()
export class AvatarSyncService {
  private readonly logger = new Logger(AvatarSyncService.name)
  private readonly GRAPH_API_TIMEOUT = 10000
  private readonly MAX_PHOTO_SIZE = 5 * 1024 * 1024 // 5MB

  async fetchUserPhoto(
    accessToken: string,
    format: 'base64' | 'url' = 'base64'
  ): Promise<AvatarSyncResult> {
    try {
      if (format === 'base64') {
        return await this.fetchPhotoAsBase64(accessToken)
      } else {
        return await this.fetchPhotoUrl(accessToken)
      }
    } catch (error) {
      this.logger.warn('Failed to fetch user photo:', error)
      return {
        synced: false,
      }
    }
  }

  private async fetchPhotoAsBase64(
    accessToken: string
  ): Promise<AvatarSyncResult> {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/photo/$value',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(this.GRAPH_API_TIMEOUT),
        }
      )

      if (response.status === 404) {
        // User has no photo
        this.logger.debug('User has no profile photo')
        return { synced: false }
      }

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()

      // Check size
      if (buffer.byteLength > this.MAX_PHOTO_SIZE) {
        this.logger.warn(
          `Photo size ${buffer.byteLength} exceeds max ${this.MAX_PHOTO_SIZE}`
        )
        return { synced: false }
      }

      // Convert to base64
      const base64 = Buffer.from(buffer).toString('base64')

      // Detect MIME type from response
      const contentType =
        response.headers.get('content-type') || 'image/jpeg'

      const photoBase64 = `data:${contentType};base64,${base64}`

      this.logger.debug(
        `Successfully fetched user photo (${buffer.byteLength} bytes)`
      )

      return {
        photoBase64,
        synced: true,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.warn('Photo fetch timeout')
      } else {
        this.logger.warn('Failed to fetch photo as base64:', error)
      }
      return { synced: false }
    }
  }

  private async fetchPhotoUrl(
    accessToken: string
  ): Promise<AvatarSyncResult> {
    try {
      // Try to get photo metadata to construct URL
      // Azure AD doesn't provide direct CDN URL for photos,
      // so we use the $value endpoint or fall back to base64
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/photos',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(this.GRAPH_API_TIMEOUT),
        }
      )

      if (!response.ok) {
        // If metadata endpoint fails, fallback to base64
        return this.fetchPhotoAsBase64(accessToken)
      }

      const data = (await response.json()) as Record<string, any>

      // Azure AD Graph API doesn't provide public CDN URLs for photos
      // Return the $value endpoint as a callable URL (requires auth)
      const photoUrl =
        'https://graph.microsoft.com/v1.0/me/photo/$value'

      this.logger.debug('Photo URL obtained from Graph API')

      return {
        photoUrl,
        synced: true,
      }
    } catch (error) {
      this.logger.warn('Failed to fetch photo URL:', error)
      // Fallback to base64
      return this.fetchPhotoAsBase64(accessToken)
    }
  }

  // Check if user has a profile photo
  async hasProfilePhoto(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/photo',
        {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      )

      return response.ok
    } catch (error) {
      this.logger.debug('Failed to check if user has profile photo:', error)
      return false
    }
  }

  // Format photo for storage (choose between base64 and URL)
  formatPhotoForStorage(
    photoResult: AvatarSyncResult,
    preferBase64: boolean = true
  ): string | null {
    if (!photoResult.synced) {
      return null
    }

    if (preferBase64 && photoResult.photoBase64) {
      return photoResult.photoBase64
    }

    if (photoResult.photoUrl) {
      // Note: Photo URL requires authentication to access
      // Only useful if you're storing the token with it
      return photoResult.photoUrl
    }

    return null
  }
}
