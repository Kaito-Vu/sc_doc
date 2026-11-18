export interface PageHistoryRecordedEvent {
  pageId: string;
  spaceId: string;
  workspaceId: string;
  historyId: string;
  contributorIds: string[];
  title: string | null;
  /** true when an earlier history row with content existed */
  hadPreviousContent: boolean;
}
