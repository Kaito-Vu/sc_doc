import api from "@/lib/api-client";
import { IPagination, SpaceRole } from "@/lib/types.ts";
import {
  IAccessInfo,
  IPendingAccessRequest,
} from "@/ee/space-access-request/types/space-access-request.types";

const base = "/space-access-requests";

export async function getAccessInfo(spaceSlug: string): Promise<IAccessInfo> {
  const req = await api.post<IAccessInfo>(`${base}/info`, { spaceSlug });
  return req.data;
}

export async function createAccessRequest(data: {
  spaceId: string;
  role: SpaceRole;
  message?: string;
}): Promise<void> {
  await api.post(`${base}/create`, data);
}

export async function cancelAccessRequest(id: string): Promise<void> {
  await api.post(`${base}/cancel`, { id });
}

export async function listAccessRequests(
  cursor?: string,
): Promise<IPagination<IPendingAccessRequest>> {
  const req = await api.post<IPagination<IPendingAccessRequest>>(
    `${base}/list`,
    { cursor },
  );
  return req.data;
}

export async function countAccessRequests(): Promise<number> {
  const req = await api.post<{ count: number }>(`${base}/count`);
  return req.data.count;
}

export async function approveAccessRequest(
  id: string,
  role: SpaceRole,
): Promise<void> {
  await api.post(`${base}/approve`, { id, role });
}

export async function rejectAccessRequest(
  id: string,
  reason?: string,
): Promise<void> {
  await api.post(`${base}/reject`, { id, reason });
}
