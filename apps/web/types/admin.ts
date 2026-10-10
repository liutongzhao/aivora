export type AdminOverview = {
  users: number;
  tasks: number;
  runningTasks: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  username: string | null;
  role: string;
  status: string;
  isActive: boolean;
  createdAt: string | null;
};

export type AdminUserDetail = {
  user: {
    id: string;
    email: string;
    username: string | null;
    status: string;
    emailVerified: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
  };
  usage: {
    trialTotal: number;
    trialUsed: number;
    trialRemaining: number;
    taskCount: number;
  };
  entitlement: {
    status: string;
    startsAt: string;
    expiresAt: string;
  } | null;
};

export type AdminUserFilters = {
  search?: string;
  limit?: number;
};
