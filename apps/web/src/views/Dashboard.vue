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

      <section v-if="auth.isPortalUser" class="panel notice-panel">
        <div class="notice-copy">
          <h3>{{ notice.title }}</h3>
          <p>{{ notice.text }}</p>
        </div>
        <div class="notice-side">
          <div v-if="todayCheckInRewardLabel" class="notice-spend">
            <strong>{{ todayCheckInRewardLabel }}</strong>
            <span>{{ t("checkIn.reward") }}</span>
          </div>
          <el-button
            type="primary"
            class="notice-button"
            :loading="credits.saving"
            :disabled="auth.isPortalUser && credits.summary?.todayCheckedIn"
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
                viewBox="0 0 720 300"
                role="img"
                :aria-label="t('dashboard.trendTitle')"
                @mouseleave="activeTrendIndex = null"
              >
                <line
                  :x1="trendChart.left"
                  :y1="trendChart.top"
                  :x2="trendChart.left"
                  :y2="trendChart.bottom"
                  class="trend-axis"
                />
                <line
                  :x1="trendChart.left"
                  :y1="trendChart.bottom"
                  :x2="trendChart.right"
                  :y2="trendChart.bottom"
                  class="trend-axis"
                />
                <line
                  :x1="trendChart.right"
                  :y1="trendChart.top"
                  :x2="trendChart.right"
                  :y2="trendChart.bottom"
                  class="trend-axis trend-axis-secondary"
                />
                <g
                  v-for="tick in trendChart.requestTicks"
                  :key="`request-tick-${tick.label}`"
                >
                  <line
                    :x1="trendChart.left"
                    :y1="tick.y"
                    :x2="trendChart.right"
                    :y2="tick.y"
                    class="trend-guide"
                  />
                  <text
                    :x="trendChart.left - 10"
                    :y="tick.y + 4"
                    text-anchor="end"
                    class="trend-axis-label"
                  >
                    {{ tick.label }}
                  </text>
                </g>
                <text
                  v-for="tick in trendChart.costTicks"
                  :key="`cost-tick-${tick.label}`"
                  :x="trendChart.right + 10"
                  :y="tick.y + 4"
                  class="trend-axis-label trend-axis-label-cost"
                >
                  {{ tick.label }}
                </text>
                <text
                  v-for="label in trendChart.xLabels"
                  :key="label.label"
                  :x="label.x"
                  :y="trendChart.bottom + 28"
                  text-anchor="middle"
                  class="trend-axis-label trend-x-label"
                >
                  {{ label.label }}
                </text>
                <polyline
                  :points="trendChart.requestLine"
                  fill="none"
                  class="trend-line trend-line-requests"
                />
                <polyline
                  :points="trendChart.costLine"
                  fill="none"
                  class="trend-line trend-line-cost"
                />
                <g v-if="activeTrendPoint" class="trend-crosshair">
                  <line
                    :x1="activeTrendPoint.x"
                    :y1="trendChart.top"
                    :x2="activeTrendPoint.x"
                    :y2="trendChart.bottom"
                  />
                  <line
                    :x1="trendChart.left"
                    :y1="activeTrendPoint.requestY"
                    :x2="trendChart.right"
                    :y2="activeTrendPoint.requestY"
                  />
                </g>
                <circle
                  v-for="point in trendChart.points"
                  :key="`request-${point.bucket}`"
                  :cx="point.x"
                  :cy="point.requestY"
                  :r="activeTrendPoint?.bucket === point.bucket ? 6 : 4"
                  class="trend-dot trend-dot-requests"
                />
                <circle
                  v-for="point in trendChart.points"
                  :key="`cost-${point.bucket}`"
                  :cx="point.x"
                  :cy="point.costY"
                  :r="activeTrendPoint?.bucket === point.bucket ? 6 : 4"
                  class="trend-dot trend-dot-cost"
                />
                <rect
                  v-for="(point, index) in trendChart.points"
                  :key="`hit-${point.bucket}`"
                  :x="point.hitX"
                  :y="trendChart.top"
                  :width="point.hitWidth"
                  :height="trendChart.plotHeight"
                  class="trend-hit-area"
                  @mouseenter="activeTrendIndex = index"
                  @mousemove="activeTrendIndex = index"
                />
              </svg>
              <div
                v-if="activeTrendPoint"
                class="trend-tooltip"
                :style="trendTooltipStyle"
              >
                <strong>{{ activeTrendPoint.tooltip.bucket }}</strong>
                <span>
                  <i class="trend-legend-dot trend-legend-requests" />
                  {{ t("dashboard.requestsToday") }}
                  <b>{{ activeTrendPoint.tooltip.requests }}</b>
                </span>
                <span>
                  <i class="trend-legend-dot trend-legend-cost" />
                  {{ t("dashboard.todaySpend") }}
                  <b>{{ activeTrendPoint.tooltip.cost }}</b>
                </span>
                <span>
                  {{ t("dashboard.tokensToday") }}
                  <b>{{ activeTrendPoint.tooltip.tokens }}</b>
                </span>
              </div>
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
import { buildTrendChartModel } from "../utils/trend-chart";
import { formatUsd } from "../utils/money";

const store = useOverviewStore();
const auth = useAuthStore();
const credits = useCreditsStore();
const { t } = useI18n();
const timeRange = ref("7d");
const granularity = ref("daily");
const activeTrendIndex = ref<number | null>(null);

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
const recentRequests = computed(() => store.data?.recentRequests ?? []);
const rawTrendRows = computed(() => dashboard.value?.trend ?? []);
const requestPager = usePagination(() => recentRequests.value, 10);
const pagedRecentRequests = computed(() => requestPager.rows.value);
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
        ? formatBalance(credits.summary?.balanceUsd ?? 0)
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
}));

const todayCheckInRewardLabel = computed(() => {
  if (!auth.isPortalUser || !credits.summary?.todayCheckedIn) {
    return "";
  }
  return formatBalance(credits.checkInStatus?.rewardUsd ?? credits.summary.dailyRewardUsd);
});

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

const chartColors = ["#b06044", "#6e867b", "#d3a15f", "#7f6fa8", "#4d7890", "#b35a4f"];

const trendChart = computed(() =>
  buildTrendChartModel(
    rawTrendRows.value.map((row) => ({
      bucket: row.bucket,
      requests: row.requests,
      tokens: row.tokens,
      costUsd: row.costUsd,
    })),
  ),
);

const activeTrendPoint = computed(() => {
  const index = activeTrendIndex.value;
  if (index === null) return undefined;
  return trendChart.value.points[index];
});

const trendTooltipStyle = computed(() => {
  const point = activeTrendPoint.value;
  if (!point) return {};
  const leftPercent = (point.x / trendChart.value.width) * 100;
  const topPercent =
    (Math.min(point.requestY, point.costY) / trendChart.value.height) * 100;
  return {
    left: `${Math.min(Math.max(leftPercent, 18), 82)}%`,
    top: `${Math.min(Math.max(topPercent, 16), 70)}%`,
  };
});

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

function formatBalance(value: number) {
  return formatUsd(value);
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
    totalRequests: t("dashboard.totalRequests"),
    userCount: t("dashboard.userCount"),
    activeUsers: t("dashboard.activeUsers"),
    windowTokens: t("dashboard.windowTokens"),
    windowRequests: t("dashboard.windowRequests"),
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
    "platform total": t("dashboard.platformTotal"),
    "registered users": t("dashboard.registeredUsers"),
    "last 30 days": t("dashboard.last30Days"),
    "selected window": t("dashboard.selectedWindow"),
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
  if (credits.summary?.todayCheckedIn) return;
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
