export type UserProfile = {
  id: string;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string | null;
};

export type UsageSummary = {
  trialTotal: number;
  trialUsed: number;
  trialRemaining: number;
  entitlementActive: boolean;
  entitlementExpiresAt: string | null;
  entitlementStatus: string | null;
};

export type Entitlement = {
  id: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  source: string | null;
};

export type ModelStatus = {
  total: number;
  enabled: number;
  visionCapable: number;
  ready: boolean;
};

export type DesktopStatus = {
  connected: boolean;
  lastSeenAt: string | null;
};

export type UsageRecord = {
  id: string;
  usageType: string;
  amount: number;
  status: string;
  createdAt: string;
  taskId: string | null;
};

export type AccountIssue = {
  source: "user" | "usage" | "entitlements" | "models" | "usage-history";
  message: string;
};

export type AccountSnapshot = {
  user: UserProfile;
  usage: UsageSummary;
  entitlement: Entitlement | null;
  modelStatus: ModelStatus;
  desktopStatus: DesktopStatus;
  issues: AccountIssue[];
};
