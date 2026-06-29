// Detail Info Panel Component Types
import type { IPage, IContributor } from '@/features/page/types/page.types';
import type { ISpace } from '@/features/space/types/space.types';

export interface DetailInfoPanelProps {
  pageId?: string;
  onClose?: () => void;
}

export interface SectionProps {
  page: Page;
  pageId: string;
  isLoading?: boolean;
}

// Page type for Detail Info Panel (compatible with IPage)
export type Page = IPage & {
  // Additional properties for Detail Info Panel
  updatedBy?: UserInfo; // Alias for lastUpdatedBy
  viewCount?: number;
  editCount?: number;
  isArchived?: boolean;
  isFullWidth?: boolean;
  isProtected?: boolean;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Contributor {
  userId: string;
  name: string;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  joinedAt: Date;
  avatar?: string;
}

export interface Space {
  id: string;
  name: string;
  slug: string;
}

export interface PagePermissions {
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canArchive: boolean;
}

export interface PageStats {
  viewCount: number;
  editCount: number;
  createdAt: Date;
  updatedAt: Date;
  creator: UserInfo;
  lastUpdatedBy: UserInfo;
  contributors: Contributor[];
}

export interface PageSettings {
  isFullWidth: boolean;
  isProtected: boolean;
  isArchived: boolean;
  allowComments?: boolean;
  allowVersionHistory?: boolean;
  publicLink?: string;
}

export interface PageHistory {
  id: string;
  version: number;
  createdAt: Date;
  author: UserInfo;
  changeType: string;
  summary: string;
}

export interface ExportFormat {
  format: 'pdf' | 'html' | 'markdown' | 'docx';
}

export interface DetailInfoPanelState {
  isOpen: boolean;
  isCollapsed: boolean;
}
