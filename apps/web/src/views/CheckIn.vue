<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("checkIn.title") }}</h2>
        <p>{{ t("checkIn.subtitle") }}</p>
      </div>
      <el-button :loading="credits.loading" @click="refresh">
        {{ t("common.refresh") }}
      </el-button>
    </div>

    <el-alert
      v-if="credits.error"
      :title="credits.error"
      type="error"
      show-icon
      class="mb"
    />

    <div class="metric-grid metric-grid-reference">
      <article class="metric metric-reference">
        <span>{{ t("credits.balance") }}</span>
        <strong class="metric-emphasis">{{ money(credits.summary?.balanceUsd) }}</strong>
        <small>{{ t("credits.available") }}</small>
      </article>
      <article class="metric metric-reference">
        <span>{{ t("credits.todayStatus") }}</span>
        <strong>
          {{
            credits.summary?.todayCheckedIn
              ? t("credits.checkedIn")
              : t("credits.notCheckedIn")
          }}
        </strong>
        <small>{{ credits.checkInStatus?.checkInDate ?? "-" }}</small>
      </article>
      <article class="metric metric-reference">
        <span>{{ t("checkIn.reward") }}</span>
        <strong>{{ rewardLabel }}</strong>
        <small>{{ rewardCaption }}</small>
      </article>
      <article class="metric metric-reference">
        <span>{{ t("checkIn.nextDate") }}</span>
        <strong>{{ credits.summary?.nextCheckInDate ?? credits.checkInStatus?.nextCheckInDate ?? "-" }}</strong>
        <small>{{ t("checkIn.streakHint") }}</small>
      </article>
    </div>

    <section class="panel notice-panel">
      <div class="notice-copy">
        <h3>{{ t("credits.checkInTitle") }}</h3>
        <p>
          {{
            credits.summary?.todayCheckedIn
              ? t("credits.checkedInText")
              : t("credits.checkInText")
          }}
        </p>
      </div>
      <div class="notice-side">
        <div class="notice-spend">
          <strong>{{ t("checkIn.ruleTitle") }}</strong>
          <span>{{ t("checkIn.ruleText") }}</span>
        </div>
        <el-button
          type="primary"
          class="notice-button"
          :loading="credits.saving"
          :disabled="credits.summary?.todayCheckedIn"
          @click="checkIn"
        >
          {{
            credits.summary?.todayCheckedIn
              ? t("credits.checkedIn")
              : t("credits.checkIn")
          }}
        </el-button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("checkIn.history") }}</h3>
        <span class="panel-meta">{{ credits.ledgerTotal }}</span>
      </div>
      <el-table :data="credits.ledgerRows">
        <el-table-column prop="createdAt" :label="t('requests.time')" min-width="190">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column :label="t('credits.change')" width="140">
          <template #default="{ row }">+{{ money(row.amountUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('credits.balanceAfter')" width="170">
          <template #default="{ row }">{{ money(row.balanceAfterUsd) }}</template>
        </el-table-column>
        <el-table-column prop="description" :label="t('credits.description')" min-width="220" />
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="credits.ledgerFilters.page"
          v-model:page-size="credits.ledgerFilters.pageSize"
          :total="credits.ledgerTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="credits.refreshLedger"
          @size-change="refreshLedgerFromFirstPage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "../i18n";
import { useCreditsStore } from "../stores/credits";
import { formatUsd } from "../utils/money";

const { t } = useI18n();
const credits = useCreditsStore();

const money = formatUsd;
const rewardLabel = computed(() => {
  if (!credits.summary?.todayCheckedIn) {
    return t("credits.notCheckedIn");
  }
  return `+${money(credits.checkInStatus?.rewardUsd ?? 0)}`;
});
const rewardCaption = computed(() =>
  credits.summary?.todayCheckedIn ? t("credits.available") : "-",
);

async function refresh() {
  credits.ledgerFilters.type = "checkin";
  await Promise.all([credits.refreshSummary(), credits.refreshLedger()]);
}

async function checkIn() {
  if (credits.summary?.todayCheckedIn) return;
  try {
    const result = await credits.checkIn();
    ElMessage.success(
      result.ledger ? t("credits.checkInSuccess") : t("credits.checkedIn"),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

function refreshLedgerFromFirstPage() {
  credits.ledgerFilters.page = 1;
  void credits.refreshLedger();
}

onMounted(() => {
  credits.ledgerFilters.type = "checkin";
  credits.ledgerFilters.page = 1;
  void refresh();
});

onUnmounted(() => {
  credits.ledgerFilters.type = "";
});
</script>
