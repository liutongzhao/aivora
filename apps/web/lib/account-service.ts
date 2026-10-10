import { apiFetch } from "./api-client";
import type {
  AccountIssue,
  AccountSnapshot,
  DesktopStatus,
  Entitlement,
  ModelStatus,
  UsageRecord,
  UsageSummary,
  UserProfile,
} from "../types/account";

export type { AccountSnapshot } from "../types/account";

type ApiUser = {
  id: string;
  email: string;
  username?: string | null;
  role?: string;
  is_active?: boolean;
  email_verified_at?: string | null;
  created_at?: string | null;
};

type ApiEntitlement = {
  id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  source?: string | null;
};

type ApiUsageRecord = {
  id: string;
  usage_type: string;
  amount: number;
  status: string;
  created_at: string;
  task_id?: string | null;
};

type ApiModel = {
  enabled?: boolean;
  supports_vision?: boolean;
};

const emptyUsage: UsageSummary = {
  trialTotal: 0,
  trialUsed: 0,
  trialRemaining: 0,
  entitlementActive: false,
  entitlementExpiresAt: null,
  entitlementStatus: null,
};

const emptyModelStatus: ModelStatus = {
  total: 0,
  enabled: 0,
  visionCapable: 0,
  ready: false,
};

const emptyDesktopStatus: DesktopStatus = {
  connected: false,
  lastSeenAt: null,
};

function normalizeUser(user: ApiUser): UserProfile {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    role: user.role ?? "user",
    isActive: user.is_active !== false,
    emailVerifiedAt: user.email_verified_at ?? null,
    createdAt: user.created_at ?? null,
  };
}

function normalizeUsage(usage: Partial<UsageSummary> | null | undefined): UsageSummary {
  return {
    trialTotal: Number(usage?.trialTotal ?? 0),
    trialUsed: Number(usage?.trialUsed ?? 0),
    trialRemaining: Number(usage?.trialRemaining ?? 0),
    entitlementActive: usage?.entitlementActive === true,
    entitlementExpiresAt: usage?.entitlementExpiresAt ?? null,
    entitlementStatus: usage?.entitlementStatus ?? null,
  };
}

function normalizeEntitlement(entitlement: ApiEntitlement): Entitlement {
  return {
    id: entitlement.id,
    status: entitlement.status,
    startsAt: entitlement.starts_at,
    expiresAt: entitlement.expires_at,
    source: entitlement.source ?? null,
  };
}

function normalizeUsageRecord(record: ApiUsageRecord): UsageRecord {
  return {
    id: record.id,
    usageType: record.usage_type,
    amount: Number(record.amount),
    status: record.status,
    createdAt: record.created_at,
    taskId: record.task_id ?? null,
  };
}

function getModelStatus(models: ApiModel[]): ModelStatus {
  const enabledModels = models.filter((model) => model.enabled === true);
  const visionModels = enabledModels.filter((model) => model.supports_vision === true);
  return {
    total: models.length,
    enabled: enabledModels.length,
    visionCapable: visionModels.length,
    ready: visionModels.length > 0,
  };
}

async function getOptional<T>(
  source: AccountIssue["source"],
  request: Promise<T>,
  fallback: T,
  issues: AccountIssue[],
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    issues.push({
      source,
      message: error instanceof Error ? error.message : "数据加载失败",
    });
    return fallback;
  }
}

export async function getAccountEntitlements(): Promise<Entitlement[]> {
  const records = await apiFetch<ApiEntitlement[]>("/api/account/entitlements");
  return records.map(normalizeEntitlement);
}

export async function getAccountUsageHistory(): Promise<UsageRecord[]> {
  const records = await apiFetch<ApiUsageRecord[]>("/api/account/usage-history");
  return records.map(normalizeUsageRecord);
}

export async function getAccountSnapshot(): Promise<AccountSnapshot> {
  const issues: AccountIssue[] = [];
  const userResponse = await apiFetch<{ user: ApiUser }>("/api/session_status");
  const user = normalizeUser(userResponse.user);
  const usage = await getOptional(
    "usage",
    apiFetch<UsageSummary>("/api/account/usage"),
    emptyUsage,
    issues,
  );
  const entitlements = await getOptional(
    "entitlements",
    getAccountEntitlements(),
    [],
    issues,
  );
  const models = await getOptional(
    "models",
    apiFetch<ApiModel[]>("/api/ai/models"),
    [],
    issues,
  );

  return {
    user,
    usage: normalizeUsage(usage),
    entitlement: entitlements.find((item) => item.status === "active") ?? entitlements[0] ?? null,
    modelStatus: getModelStatus(models),
    desktopStatus: emptyDesktopStatus,
    issues,
  };
}
