import { SpaceRole } from "@/lib/types.ts";

export type AccessRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface IAccessRequestSummary {
  id: string;
  status: AccessRequestStatus;
  roleRequested: SpaceRole;
  roleGranted: SpaceRole | null;
  decisionReason: string | null;
  createdAt: string;
}

export interface IAccessInfo {
  space: { id: string; name: string; slug: string } | null;
  request: IAccessRequestSummary | null;
  canRequest: boolean;
}

export interface IPendingAccessRequest {
  id: string;
  spaceId: string;
  roleRequested: SpaceRole;
  message: string | null;
  createdAt: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  spaceName: string;
  spaceSlug: string;
}
