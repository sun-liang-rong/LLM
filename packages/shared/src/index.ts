export type ProviderId = string;

export type UpstreamProtocol = "openai-compatible" | "anthropic";

export type GatewayProtocol = "openai" | "anthropic";

export type ProviderKeyStatus =
  | "healthy"
  | "rate_limited"
  | "cooldown"
  | "disabled";

export type RoutingMode = "cost" | "latency" | "quality" | "balanced";

export interface GatewayModel {
  id: string;
  modelId?: string;
  modelGroupId?: string;
  modelGroupSlug?: string;
  modelGroupName?: string;
  description?: string;
  contextWindow?: number;
  priceMultiplier?: number;
  displayName: string;
  provider: ProviderId;
  providerId?: string;
  providerName?: string;
  protocol?: UpstreamProtocol | string;
  upstreamModel: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  enabled?: boolean;
  providerEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AnnouncementType = "notice" | "model" | "maintenance" | "activity";
export type AnnouncementStatus = "draft" | "published";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  pinned: boolean;
  status: AnnouncementStatus;
  publishAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  siteName: string;
  logoText: string;
  homeNotice: string;
  registrationEnabled: boolean;
  checkInEnabled: boolean;
  signupBonusUsd: number;
  dailyCheckInMinUsd: number;
  dailyCheckInMaxUsd: number;
  defaultModel: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
}

export interface ModelGroup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  multiplier: number;
  sortOrder: number;
  enabled: boolean;
  modelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingGroup {
  id: string;
  tenantId: string;
  name: string;
  multiplier: number;
  allowedModels: string[];
  description?: string;
  isDefault: boolean;
  userCount?: number;
  apiKeyCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelAlias {
  alias: string;
  targets: RouteTarget[];
  mode: RoutingMode;
}

export interface RouteTarget {
  providerId: string;
  providerSlug: string;
  upstreamProtocol: UpstreamProtocol;
  upstreamModel: string;
  weight: number;
  priority: number;
  enabled: boolean;
}

export interface RouteCandidateScore {
  providerId: string;
  providerSlug: string;
  upstreamModel: string;
  availableKeys: number;
  averageLatencyMs: number;
  successRatePercent: number;
  recentRequests: number;
  unitCost: number;
  score: number;
  selected: boolean;
  reasons: string[];
}

export interface ProviderKeySummary {
  id: string;
  provider: ProviderId;
  name: string;
  status: ProviderKeyStatus;
  rpmLimit?: number;
  tpmLimit?: number;
  dailyBudgetUsd?: number;
  weight: number;
  windowSizeMinutes?: number;
  windowRequestLimit?: number;
  windowStartedAt?: string;
  windowRequestCount?: number;
  windowRemaining?: number;
  windowResetAt?: string;
  cooldownUntil?: string;
  lastError?: string;
}

export interface UsageSummary {
  requestsToday: number;
  tokensToday: number;
  costTodayUsd: number;
  errorRatePercent: number;
  p95LatencyMs: number;
}

export interface DashboardMetricCard {
  label: string;
  value: string;
  caption: string;
  emphasis?: boolean;
}

export interface DashboardPlatformBreakdown {
  name: string;
  requests: number;
  tokens: number;
  todayCostUsd: number;
  totalCostUsd: number;
}

export interface DashboardNoticeSummary {
  title: string;
  text: string;
  actionLabel: string;
  spendLabel: string;
  hint: string;
}

export interface DashboardOverview {
  topMetrics: DashboardMetricCard[];
  secondaryMetrics: DashboardMetricCard[];
  platformBreakdown: DashboardPlatformBreakdown[];
  notice: DashboardNoticeSummary;
  trend: DashboardTrendPoint[];
}

export interface DashboardTrendPoint {
  bucket: string;
  requests: number;
  tokens: number;
  costUsd: number;
}

export type BudgetScope =
  | "apiKey"
  | "project"
  | "tenant"
  | "provider"
  | "modelAlias";

export type BudgetAction = "reject" | "warn" | "downgrade";

export interface BudgetRule {
  id: string;
  tenantId: string;
  scope: BudgetScope;
  scopeId: string;
  dailyUsd?: number;
  monthlyUsd?: number;
  action: BudgetAction;
  downgradeModelAlias?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetUsageEntry {
  scope: BudgetScope;
  scopeId: string;
  dailySpentUsd: number;
  monthlySpentUsd: number;
  dailyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  dailyRemainingUsd?: number;
  monthlyRemainingUsd?: number;
  action: BudgetAction;
  downgradeModelAlias?: string;
  exceeded: boolean;
}

export type CreditLedgerType =
  | "signup_bonus"
  | "checkin"
  | "usage"
  | "admin_adjust"
  | "expired";

export interface CreditAccountSummary {
  userId: string;
  tenantId: string;
  balanceUsd: number;
  totalGrantedUsd: number;
  totalUsedUsd: number;
  todayCheckedIn: boolean;
  dailyRewardUsd: number;
  nextCheckInDate: string;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  tenantId: string;
  type: CreditLedgerType;
  amountUsd: number;
  balanceAfterUsd: number;
  requestId?: string;
  expiresAt?: string;
  description?: string;
  createdAt: string;
  userEmail?: string;
  userName?: string;
}

export interface CheckInStatus {
  checkedIn: boolean;
  checkInDate: string;
  rewardUsd: number;
  nextCheckInDate: string;
}

export interface CheckInResult extends CheckInStatus {
  account: CreditAccountSummary;
  ledger?: CreditLedgerEntry;
}

export interface AdminCreditUser {
  userId: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name?: string;
  billingGroupId?: string;
  billingGroupName?: string;
  billingMultiplier: number;
  balanceUsd: number;
  totalGrantedUsd: number;
  totalUsedUsd: number;
  todayCheckedIn?: boolean;
  todayCheckInDate?: string;
  disabled: boolean;
  updatedAt?: string;
}

export interface AlertItem {
  id: string;
  level: "warning" | "critical";
  type:
    | "budget_exceeded"
    | "budget_near_limit"
    | "provider_key_unhealthy"
    | "high_error_rate"
    | "auth_login_throttled"
    | "auth_account_locked"
    | "auth_suspicious_login";
  title: string;
  description: string;
  scope?: BudgetScope;
  scopeId?: string;
  createdAt: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
  userCount: number;
  apiKeyCount: number;
}

export interface ProjectSummary {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  apiKeyCount: number;
}

export type ConsoleRole = "owner" | "admin" | "operator" | "viewer";

export interface ConsoleUser {
  id: string;
  tenantId: string;
  email: string;
  name?: string;
  role: ConsoleRole;
  disabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortalUser {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name?: string;
  role: ConsoleRole;
  projectId?: string;
  verifiedAt?: string;
}

export interface PortalProfile {
  user: PortalUser;
  projectCount: number;
  apiKeyCount: number;
  recentUsage: {
    requestsToday: number;
    requestsThisMonth: number;
    totalRequests: number;
    costTodayUsd: number;
    costThisMonthUsd: number;
    totalCostUsd: number;
    errorRatePercent: number;
    p95LatencyMs: number;
  };
  budgetStatus: {
    totalRules: number;
    exceededRules: number;
    warningAlerts: number;
    criticalAlerts: number;
  };
  onboarding: {
    needsApiKey: boolean;
    needsFirstRequest: boolean;
    recommendedBaseUrl: string;
    recommendedProtocol: "openai" | "anthropic";
  };
}

export interface RequestDetail {
  id: string;
  requestId: string;
  protocol: string;
  tenantId?: string;
  projectId?: string;
  apiKeyId?: string;
  provider?: string;
  providerKeyId?: string;
  model: string;
  upstreamModel?: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  estimatedTokens?: boolean;
  costUsd?: number;
  latencyMs?: number;
  retryCount: number;
  error?: string;
  createdAt: string;
}
