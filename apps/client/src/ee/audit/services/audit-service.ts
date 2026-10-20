import api from "@/lib/api-client";
import {
  IAuditFacets,
  IAuditLog,
  IAuditLogParams,
  IAuditStats,
} from "@/ee/audit/types/audit.types";
import { IPagination } from "@/lib/types";

export async function getAuditLogs(
  params?: IAuditLogParams,
): Promise<IPagination<IAuditLog>> {
  const req = await api.post("/audit", { ...params });
  return req.data;
}

export async function getAuditStats(
  params?: IAuditLogParams,
): Promise<IAuditStats> {
  const req = await api.post("/audit/stats", { ...params });
  return req.data;
}

export async function getAuditFacets(
  params?: IAuditLogParams,
): Promise<IAuditFacets> {
  const req = await api.post("/audit/facets", { ...params });
  return req.data;
}

export async function getAuditLogDetail(id: string): Promise<IAuditLog> {
  const req = await api.post("/audit/detail", { id });
  return req.data;
}

export async function exportAuditLogs(params?: IAuditLogParams): Promise<Blob> {
  const req = await api.post(
    "/audit/export",
    { ...params },
    {
      responseType: "blob",
    },
  );
  return req.data;
}

export async function getAuditRetention(): Promise<{ retentionDays: number }> {
  const req = await api.post("/audit/retention");
  return req.data;
}

export async function updateAuditRetention(data: {
  auditRetentionDays: number;
}): Promise<{ retentionDays: number }> {
  const req = await api.post("/audit/retention/update", data);
  return req.data;
}
