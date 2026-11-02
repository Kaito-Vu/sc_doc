import api from "@/lib/api-client";
import { ISpace } from "@/features/space/types/space.types";

export async function getPersonalSpace(): Promise<ISpace | null> {
  const req = await api.post<ISpace | null>("/personal-space/info", {});
  return req.data;
}

export async function createPersonalSpace(): Promise<ISpace> {
  const req = await api.post<ISpace>("/personal-space/create", {});
  return req.data;
}

export interface IPersonalSpaceUsage {
  used: number;
  limit: number;
}

export async function getPersonalSpaceUsage(): Promise<IPersonalSpaceUsage | null> {
  const req = await api.post<IPersonalSpaceUsage | null>(
    "/personal-space/usage",
    {},
  );
  return req.data;
}

export interface IPersonalQuotaUser {
  userId: string;
  name: string;
  email: string;
  used: number;
  limit: number;
  override: number | null;
}

export interface IPersonalQuotaList {
  defaultLimit: number;
  users: IPersonalQuotaUser[];
}

export async function listPersonalQuotas(): Promise<IPersonalQuotaList> {
  const req = await api.post<IPersonalQuotaList>("/personal-space/quota/list", {});
  return req.data;
}

// userId omitted = workspace default; limit like "500mb", null/"" clears
export async function setPersonalQuota(data: {
  userId?: string;
  limit: string | null;
}): Promise<void> {
  await api.post("/personal-space/quota/set", data);
}
