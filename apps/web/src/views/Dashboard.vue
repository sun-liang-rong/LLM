<template>
  <section class="dashboard dashboard-reference">
    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      show-icon
      class="mb"
    />

    <div v-if="store.loading" class="dashboard-loading">
      <el-skeleton animated>
        <template #template>
          <div class="metric-grid metric-grid-reference">
            <div v-for="item in 8" :key="item" class="metric metric-reference">
              <el-skeleton-item variant="text" style="width: 34%" />
              <el-skeleton-item
                variant="text"
                style="width: 56%; height: 34px; margin-top: 16px"
              />
              <el-skeleton-item variant="text" style="width: 48%; margin-top: 12px" />
            </div>
          </div>
        </template>
      </el-skeleton>
      <section class="panel dashboard-skeleton-panel">
        <div class="panel-title">
          <el-skeleton-item variant="text" style="width: 160px" />
          <el-skeleton-item variant="text" style="width: 48px" />
        </div>
        <div class="dashboard-panel-body">
          <el-skeleton :rows="5" animated />
        </div>
      </section>
    </div>

    <template v-else>
      <div class="metric-grid metric-grid-reference">
        <article
          v-for="metric in topMetrics"
          :key="metric.label"
          class="metric metric-reference"
        >
          <span>{{ metric.label }}</span>
          <strong :class="metric.emphasis ? 'metric-emphasis' : ''">
            {{ metric.value }}
          </strong>
          <small>{{ metric.caption }}</small>
        </article>
      </div>

      <div class="metric-grid metric-grid-reference">
        <article
          v-for="metric in secondaryMetrics"
          :key="metric.label"
          class="metric metric-reference"
        >
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.caption }}</small>
        </article>
      </div>

      <section class="panel notice-panel">
        <div class="notice-copy">
          <h3>{{ notice.title }}</h3>
          <p>{{ notice.text }}</p>
        </div>
        <div class="notice-side">
          <div class="notice-spend">
            <strong>{{ notice.spendLabel }}</strong>
            <span>{{ notice.hint }}</span>
          </div>
          <el-button
            type="primary"
            class="notice-button"
            :loading="credits.saving"
            @click="handleNoticeAction"
          >
            {{ notice.actionLabel }}
          </el-button>
        </div>
      </section>

      <section v-if="!auth.isPortalUser" class="panel breakdown-panel">
        <div class="panel-title">
          <h3>{{ t("dashboard.platformBreakdown") }}</h3>
          <span class="panel-meta">
            {{ platformCards.length }} {{ t("dashboard.platformCount") }}
          </span>
        </div>
        <div class="platform-grid">
          <article
            v-for="platform in platformCards"
            :key="platform.name"
            class="platform-card"
          >
            <div class="platform-card-header">
              <h4>{{ platform.name }}</h4>
              <strong>{{ platform.totalCost }}</strong>
            </div>
            <dl class="platform-stats">
              <div>
                <dt>{{ t("dashboard.costToday") }}</dt>
                <dd>{{ platform.todayCost }}</dd>
              </div>
              <div>
                <dt>{{ t("dashboard.requestsToday") }}</dt>
                <dd>{{ platform.requests }}</dd>
              </div>
              <div>
                <dt>{{ t("dashboard.tokensToday") }}</dt>
                <dd>{{ platform.tokens }}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section class="panel trend-panel">
        <div class="panel-title trend-panel-title">
          <div>
            <h3>{{ t("dashboard.trendTitle") }}</h3>
            <span class="panel-meta">{{ trendPoints.length }}</span>
          </div>
          <div class="trend-filter-card">
            <div class="toolbar-actions">
              <span class="toolbar-label">{{ t("dashboard.timeRange") }}</span>
              <el-select v-model="timeRange" class="dashboard-range-select">
                <el-option
                  v-for="option in timeRangeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
            <div class="toolbar-actions">
              <span class="toolbar-label">{{ t("dashboard.granularity") }}</span>
              <el-select v-model="granularity" class="dashboard-range-select">
                <el-option
                  v-for="option in granularityOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
            <el-button :loading="store.loading" @click="refreshOverview">
              {{ t("common.refresh") }}
            </el-button>
          </div>
        </div>
        <template v-if="trendPoints.length > 0">
          <div class="trend-visual-grid">
            <div class="trend-line-card">
              <svg
                class="trend-line-chart"
                viewBox="0 0 720 260"
                role="img"
                :aria-label="t('dashboard.trendTitle')"
              >
                <line x1="48" y1="28" x2="48" y2="212" class="trend-axis" />
                <line x1="48" y1="212" x2="692" y2="212" class="trend-axis" />
                <line
                  v-for="line in chartGuideLines"
                  :key="line"
                  x1="48"
                  :y1="line"
                  x2="692"
                  :y2="line"
                  class="trend-guide"
                />
                <polyline
                  :points="lineChartPoints"
                  fill="none"
                  class="trend-line trend-line-requests"
                />
                <polyline
                  :points="costLineChartPoints"
                  fill="none"
                  class="trend-line trend-line-cost"
                />
                <circle
                  v-for="point in lineChartDots"
                  :key="`request-${point.label}`"
                  :cx="point.x"
                  :cy="point.requestY"
                  r="4"
                  class="trend-dot trend-dot-requests"
                />
                <circle
                  v-for="point in lineChartDots"
                  :key="`cost-${point.label}`"
                  :cx="point.x"
                  :cy="point.costY"
                  r="4"
                  class="trend-dot trend-dot-cost"
                />
              </svg>
              <div class="trend-chart-footer">
                <span>
                  <i class="trend-legend-dot trend-legend-requests" />
                  {{ t("dashboard.requestsToday") }}
                </span>
                <span>
                  <i class="trend-legend-dot trend-legend-cost" />
                  {{ t("dashboard.todaySpend") }}
                </span>
              </div>
            </div>
            <div class="trend-pie-card">
              <div
                class="trend-pie"
                :style="{ background: pieChartBackground }"
                role="img"
                :aria-label="t('dashboard.trendTitle')"
              >
                <div class="trend-pie-core">
                  <strong>{{ trendTotalRequests }}</strong>
                  <span>{{ t("dashboard.requestUnit") }}</span>
                </div>
              </div>
              <div class="trend-pie-legend">
                <span
                  v-for="slice in pieSlices"
                  :key="slice.label"
                  class="trend-pie-legend-item"
                >
                  <i :style="{ background: slice.color }" />
                  {{ slice.label }}
                </span>
              </div>
            </div>
          </div>
        </template>
        <el-empty
          v-else
          class="dashboard-empty"
          :description="t('dashboard.noTraffic')"
        />
      </section>

      <div v-if="!auth.isPortalUser" class="dashboard-columns">
        <div class="dashboard-column">
          <section class="panel">
            <div class="panel-title">
              <h3>{{ t("dashboard.modelAliases") }}</h3>
              <span class="panel-meta">{{ aliases.length }}</span>
            </div>
            <template v-if="aliases.length > 0">
              <el-table :data="pagedAliases" :empty-text="t('dashboard.noAliases')">
                <el-table-column prop="alias" :label="t('dashboard.alias')" min-width="130" />
                <el-table-column prop="mode" :label="t('dashboard.mode')" width="110" />
                <el-table-column :label="t('dashboard.target')" min-width="180">
                  <template #default="{ row }">
                    {{ row.targets[0]?.providerSlug }}/{{ row.targets[0]?.upstreamModel }}
                  </template>
                </el-table-column>
              </el-table>
              <div class="pagination-row">
                <el-pagination
                  v-model:current-page="aliasPage"
                  v-model:page-size="aliasPageSize"
                  :total="aliasTotal"
                  :page-sizes="[5, 10, 20]"
                  layout="total, prev, pager, next"
                  small
                />
              </div>
            </template>
            <el-empty
              v-else
              class="dashboard-empty"
              :description="t('dashboard.noAliases')"
            />
          </section>
        </div>

        <div class="dashboard-column">
          <section class="panel">
            <div class="panel-title">
              <h3>{{ t("dashboard.providerKeys") }}</h3>
              <span class="panel-meta">{{ providers.length }}</span>
            </div>
            <template v-if="providers.length > 0">
              <el-table :data="pagedProviders" :empty-text="t('dashboard.noProviderKeys')">
                <el-table-column prop="name" :label="t('common.name')" min-width="150" />
                <el-table-column prop="provider" :label="t('common.provider')" width="130" />
                <el-table-column :label="t('common.status')" width="130">
                  <template #default="{ row }">
                    <el-tag :type="row.status === 'healthy' ? 'success' : 'warning'">
                      {{ row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="weight" :label="t('providers.weight')" width="90" />
              </el-table>
              <div class="pagination-row">
                <el-pagination
                  v-model:current-page="providerPage"
                  v-model:page-size="providerPageSize"
                  :total="providerTotal"
                  :page-sizes="[5, 10, 20]"
                  layout="total, prev, pager, next"
                  small
                />
              </div>
            </template>
            <el-empty
              v-else
              class="dashboard-empty"
              :description="t('dashboard.noProviderKeys')"
            />
          </section>
        </div>
      </div>

      <section class="panel">
        <div class="panel-title">
          <h3>{{ t("dashboard.recentRequests") }}</h3>
          <span class="panel-meta">{{ recentRequests.length }}</span>
        </div>
        <template v-if="recentRequests.length > 0">
          <el-table :data="pagedRecentRequests" :empty-text="t('dashboard.noTraffic')">
            <el-table-column prop="requestId" :label="t('requests.requestId')" min-width="190" />
            <el-table-column prop="protocol" :label="t('common.protocol')" width="120" />
            <el-table-column prop="provider" :label="t('common.provider')" width="120" />
            <el-table-column prop="model" :label="t('common.model')" min-width="180" />
            <el-table-column :label="t('common.status')" width="120">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="latencyMs" :label="t('common.latency')" width="110" />
          </el-table>
          <div class="pagination-row">
            <el-pagination
              v-model:current-page="requestPage"
              v-model:page-size="requestPageSize"
              :total="requestTotal"
              :page-sizes="[5, 10, 20]"
              layout="total, prev, pager, next"
              small
            />
          </div>
        </template>
        <el-empty
          v-else
          class="dashboard-empty"
          :description="t('dashboard.noTraffic')"
        />
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type {
  DashboardMetricCard,
  DashboardPlatformBreakdown,
  DashboardTrendPoint,
} from "@gateway/shared";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useCreditsStore } from "../stores/credits";
import { useOverviewStore } from "../stores/overview";
import { usePagination } from "../composables/usePagination";

const store = useOverviewStore();
const auth = useAuthStore();
const credits = useCreditsStore();
const { t } = useI18n();
const timeRange = ref("7d");
const granularity = ref("daily");

const fallbackUsage = {
  requestsToday: 0,
  tokensToday: 0,
  costTodayUsd: 0,
  errorRatePercent: 0,
  p95LatencyMs: 0,
};

const timeRangeOptions = computed(() => [
  { value: "24h", label: t("dashboard.range1d") },
  { value: "7d", label: t("dashboard.range7d") },
  { value: "30d", label: t("dashboard.range30d") },
]);

const granularityOptions = computed(() => [
  { value: "hourly", label: t("dashboard.granularityHour") },
  { value: "daily", label: t("dashboard.granularityDay") },
]);

const usage = computed(() => store.data?.usage ?? fallbackUsage);
const dashboard = computed(() => store.data?.dashboard);
const providers = computed(() => store.data?.providers ?? []);
const aliases = computed(() => store.data?.aliases ?? []);
const recentRequests = computed(() => store.data?.recentRequests ?? []);
const rawTrendRows = computed(() => dashboard.value?.trend ?? []);
const providerPager = usePagination(() => providers.value, 5);
const aliasPager = usePagination(() => aliases.value, 5);
const requestPager = usePagination(() => recentRequests.value, 10);
const pagedProviders = computed(() => providerPager.rows.value);
const pagedAliases = computed(() => aliasPager.rows.value);
const pagedRecentRequests = computed(() => requestPager.rows.value);
const providerPage = computed({
  get: () => providerPager.page.value,
  set: (value: number) => {
    providerPager.page.value = value;
  },
});
const providerPageSize = computed({
  get: () => providerPager.pageSize.value,
  set: (value: number) => {
    providerPager.pageSize.value = value;
  },
});
const providerTotal = computed(() => providerPager.total.value);
const aliasPage = computed({
  get: () => aliasPager.page.value,
  set: (value: number) => {
    aliasPager.page.value = value;
  },
});
const aliasPageSize = computed({
  get: () => aliasPager.pageSize.value,
  set: (value: number) => {
    aliasPager.pageSize.value = value;
  },
});
const aliasTotal = computed(() => aliasPager.total.value);
const requestPage = computed({
  get: () => requestPager.page.value,
  set: (value: number) => {
    requestPager.page.value = value;
  },
});
const requestPageSize = computed({
  get: () => requestPager.pageSize.value,
  set: (value: number) => {
    requestPager.pageSize.value = value;
  },
});
const requestTotal = computed(() => requestPager.total.value);

const topMetrics = computed(() =>
  (dashboard.value?.topMetrics ?? []).map((metric: DashboardMetricCard) => ({
    label: metricLabel(metric.label),
    value:
      auth.isPortalUser && metric.label === "balance"
        ? formatCurrency(credits.summary?.balanceUsd ?? 0)
        : metric.value,
    caption: metricCaption(metric.caption),
    emphasis: metric.emphasis,
  })),
);

const secondaryMetrics = computed(() =>
  (dashboard.value?.secondaryMetrics ?? []).map((metric: DashboardMetricCard) => ({
    label: metricLabel(metric.label),
    value: metric.value,
    caption: metricCaption(metric.caption),
    emphasis: metric.emphasis,
  })),
);

const platformCards = computed(() =>
  (dashboard.value?.platformBreakdown ?? []).map(
    (platform: DashboardPlatformBreakdown) => ({
      name: platform.name,
      requests: formatInteger(platform.requests),
      tokens: platform.tokens > 0 ? formatCompact(platform.tokens) : "-",
      todayCost: formatCurrency(platform.todayCostUsd),
      totalCost: formatCurrency(platform.totalCostUsd),
    }),
  ),
);

const notice = computed(() => ({
  title: auth.isPortalUser ? t("credits.checkInTitle") : t("dashboard.noticeTitle"),
  text: auth.isPortalUser
    ? credits.summary?.todayCheckedIn
      ? t("credits.checkedInText")
      : t("credits.checkInText")
    : t("dashboard.noticeText"),
  actionLabel: auth.isPortalUser
    ? credits.summary?.todayCheckedIn
      ? t("credits.checkedIn")
      : t("credits.checkIn")
    : t("dashboard.noticeAction"),
  spendLabel: auth.isPortalUser
    ? `$${Number(credits.summary?.balanceUsd ?? 0).toFixed(2)}`
    : `${t("dashboard.todaySpend")} ${formatCurrency(usage.value.costTodayUsd)}`,
  hint: auth.isPortalUser
    ? `+${Number(credits.summary?.dailyRewardUsd ?? 0).toFixed(2)} · ${t("credits.available")}`
    : t("dashboard.noticeHint"),
}));

const trendPoints = computed(() => {
  const rows = rawTrendRows.value;
  const maxRequests = Math.max(...rows.map((row) => row.requests), 1);
  const maxCost = Math.max(...rows.map((row) => row.costUsd), 1);
  return rows.map((row: DashboardTrendPoint) => ({
    bucket: row.bucket,
    requests: formatInteger(row.requests),
    tokens: formatCompact(row.tokens),
    cost: formatCurrency(row.costUsd),
    requestWidth: Math.max((row.requests / maxRequests) * 100, 6),
    costWidth: Math.max((row.costUsd / maxCost) * 100, 6),
  }));
});

const chartGuideLines = [64, 110, 156, 202];
const chartColors = ["#b06044", "#6e867b", "#d3a15f", "#7f6fa8", "#4d7890", "#b35a4f"];

const lineChartDots = computed(() => {
  const rows = rawTrendRows.value;
  const maxRequests = Math.max(...rows.map((row) => row.requests), 1);
  const maxCost = Math.max(...rows.map((row) => row.costUsd), 1);
  const width = 644;
  const height = 184;
  const left = 48;
  const bottom = 212;
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  return rows.map((row, index) => ({
    label: row.bucket,
    x: rows.length > 1 ? left + step * index : left + width / 2,
    requestY: bottom - (row.requests / maxRequests) * height,
    costY: bottom - (row.costUsd / maxCost) * height,
  }));
});

const lineChartPoints = computed(() =>
  lineChartDots.value.map((point) => `${point.x},${point.requestY}`).join(" "),
);

const costLineChartPoints = computed(() =>
  lineChartDots.value.map((point) => `${point.x},${point.costY}`).join(" "),
);

const pieSlices = computed(() => {
  const rows = rawTrendRows.value.filter((row) => row.requests > 0);
  const total = rows.reduce((sum, row) => sum + row.requests, 0);
  if (!total) return [];
  return rows.slice(0, 6).map((row, index) => ({
    label: row.bucket,
    value: row.requests,
    color: chartColors[index % chartColors.length],
  }));
});

const pieChartBackground = computed(() => {
  if (pieSlices.value.length === 0) {
    return "conic-gradient(var(--line) 0 100%)";
  }
  const total = pieSlices.value.reduce((sum, slice) => sum + slice.value, 0);
  let start = 0;
  const stops = pieSlices.value.map((slice) => {
    const end = start + (slice.value / total) * 100;
    const segment = `${slice.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return segment;
  });
  return `conic-gradient(${stops.join(", ")})`;
});

const trendTotalRequests = computed(() =>
  formatCompact(rawTrendRows.value.reduce((sum, row) => sum + row.requests, 0)),
);

function refreshOverview() {
  return store.refresh({
    range: timeRange.value,
    granularity: granularity.value,
  });
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Math.round(value || 0));
}

function formatCompact(value: number) {
  if (!value) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatInteger(value);
}

function formatCurrency(value: number) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatSeconds(value: number) {
  return `${(Number(value || 0) / 1000).toFixed(2)}s`;
}

function metricLabel(key: string) {
  const mapping: Record<string, string> = {
    balance: t("dashboard.balance"),
    apiKeys: t("dashboard.apiKeysCount"),
    requestsToday: t("dashboard.requestsToday"),
    todaySpend: t("dashboard.todaySpend"),
    tokensToday: t("dashboard.tokensToday"),
    totalTokens: t("dashboard.totalTokens"),
    performance: t("dashboard.performanceLabel"),
    avgLatency: t("dashboard.avgLatency"),
  };
  return mapping[key] ?? key;
}

function metricCaption(value: string) {
  const mapping: Record<string, string> = {
    available: t("dashboard.availableBalance"),
    "input / output synced": t("dashboard.inputOutputHint"),
    "lifetime usage": t("dashboard.outputEstimateHint"),
    "average time": t("dashboard.avgTimeHint"),
    dailyCheckInHint: t("dashboard.noticeHint"),
  };
  return mapping[value] ?? value;
}

function statusType(status: string) {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  return "warning";
}

async function handleNoticeAction() {
  if (!auth.isPortalUser) return;
  try {
    const result = await credits.checkIn();
    ElMessage.success(
      result.ledger ? t("credits.checkInSuccess") : t("credits.checkedIn"),
    );
    await refreshOverview();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

onMounted(() => {
  void refreshOverview();
  if (auth.isPortalUser) {
    void credits.refreshSummary().catch(() => undefined);
  }
});

watch([timeRange, granularity], () => {
  void refreshOverview();
});
</script>
