<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("credits.title") }}</h2>
        <p>{{ t("credits.subtitle") }}</p>
      </div>
      <el-button :loading="store.loading" @click="refresh">
        {{ t("common.refresh") }}
      </el-button>
    </div>

    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      show-icon
      class="mb"
    />

    <template v-if="auth.isPortalUser">
      <div class="metric-grid metric-grid-reference">
        <article class="metric metric-reference">
          <span>{{ t("credits.balance") }}</span>
          <strong>{{ money(store.summary?.balanceUsd) }}</strong>
          <small>{{ t("credits.available") }}</small>
        </article>
        <article class="metric metric-reference">
          <span>{{ t("credits.totalGranted") }}</span>
          <strong>{{ money(store.summary?.totalGrantedUsd) }}</strong>
          <small>{{ t("credits.lifetime") }}</small>
        </article>
        <article class="metric metric-reference">
          <span>{{ t("credits.totalUsed") }}</span>
          <strong>{{ money(store.summary?.totalUsedUsd) }}</strong>
          <small>{{ t("credits.lifetime") }}</small>
        </article>
      </div>

      <section class="panel notice-panel">
        <div class="notice-copy">
          <h3>{{ t("credits.checkInTitle") }}</h3>
          <p>
            {{
              store.summary?.todayCheckedIn
                ? t("credits.checkedInText")
                : t("credits.checkInText")
            }}
          </p>
        </div>
        <div class="notice-side">
          <div class="notice-spend">
            <strong>+{{ money(store.summary?.dailyRewardUsd ?? 0) }}</strong>
            <span>{{ t("credits.expiresHint") }}</span>
          </div>
          <el-button
            type="primary"
            class="notice-button"
            :loading="store.saving"
            @click="checkIn"
          >
            {{
              store.summary?.todayCheckedIn
                ? t("credits.checkedIn")
                : t("credits.checkIn")
            }}
          </el-button>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="panel">
        <div class="panel-title">
          <h3>{{ t("credits.users") }}</h3>
          <div class="filter-row">
            <el-input
              v-model="store.userFilters.email"
              clearable
              :placeholder="t('tenancy.userEmail')"
              class="filter-control"
              @keyup.enter="refreshUsersFromFirstPage"
              @clear="refreshUsersFromFirstPage"
            />
          </div>
        </div>
        <el-table :data="store.userRows">
          <el-table-column prop="email" :label="t('tenancy.userEmail')" min-width="220" />
          <el-table-column :label="t('credits.balance')" width="150">
            <template #default="{ row }">{{ money(row.balanceUsd) }}</template>
          </el-table-column>
          <el-table-column :label="t('credits.totalGranted')" width="150">
            <template #default="{ row }">{{ money(row.totalGrantedUsd) }}</template>
          </el-table-column>
          <el-table-column :label="t('credits.totalUsed')" width="150">
            <template #default="{ row }">{{ money(row.totalUsedUsd) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openAdjust(row.userId)">
                {{ t("credits.adjust") }}
              </el-button>
              <el-button link type="primary" @click="filterLedger(row.userId)">
                {{ t("credits.ledger") }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            v-model:current-page="store.userFilters.page"
            v-model:page-size="store.userFilters.pageSize"
            :total="store.userTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="store.refreshUsers"
            @size-change="refreshUsersFromFirstPage"
          />
        </div>
      </section>
    </template>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("credits.ledger") }}</h3>
        <el-button
          v-if="!auth.isPortalUser && store.ledgerFilters.userId"
          link
          type="primary"
          @click="clearLedgerFilter"
        >
          {{ t("credits.clearFilter") }}
        </el-button>
      </div>
      <el-table :data="store.ledgerRows">
        <el-table-column prop="createdAt" :label="t('requests.time')" min-width="190">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="!auth.isPortalUser"
          prop="userEmail"
          :label="t('tenancy.userEmail')"
          min-width="220"
        />
        <el-table-column :label="t('credits.type')" width="150">
          <template #default="{ row }">{{ ledgerType(row.type) }}</template>
        </el-table-column>
        <el-table-column :label="t('credits.change')" width="140">
          <template #default="{ row }">
            <span :class="row.amountUsd >= 0 ? 'success-text' : 'error-text'">
              {{ row.amountUsd >= 0 ? "+" : "" }}{{ money(row.amountUsd) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('credits.balanceAfter')" width="150">
          <template #default="{ row }">{{ money(row.balanceAfterUsd) }}</template>
        </el-table-column>
        <el-table-column prop="requestId" :label="t('requests.requestId')" min-width="220" />
        <el-table-column prop="description" :label="t('credits.description')" min-width="220" />
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="store.ledgerFilters.page"
          v-model:page-size="store.ledgerFilters.pageSize"
          :total="store.ledgerTotal"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="store.refreshLedger"
          @size-change="refreshLedgerFromFirstPage"
        />
      </div>
    </section>

    <el-dialog v-model="adjustOpen" :title="t('credits.adjust')" width="420px">
      <el-form label-position="top">
        <el-form-item :label="t('credits.amount')">
          <el-input-number v-model="adjustForm.amountUsd" :step="1" />
        </el-form-item>
        <el-form-item :label="t('credits.description')">
          <el-input v-model="adjustForm.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="store.saving" @click="adjust">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useCreditsStore } from "../stores/credits";
import { formatUsd } from "../utils/money";

const { t } = useI18n();
const auth = useAuthStore();
const store = useCreditsStore();
const adjustOpen = ref(false);
const adjustForm = reactive({
  userId: "",
  amountUsd: 1,
  description: "",
});

const money = formatUsd;

function ledgerType(type: string) {
  const mapping: Record<string, ReturnType<typeof t>> = {
    signup_bonus: t("credits.type.signup_bonus"),
    checkin: t("credits.type.checkin"),
    usage: t("credits.type.usage"),
    admin_adjust: t("credits.type.admin_adjust"),
    expired: t("credits.type.expired"),
  };
  return mapping[type] ?? type;
}

async function refresh() {
  if (auth.isPortalUser) {
    await store.refreshSummary();
    await store.refreshLedger();
    return;
  }
  await Promise.all([store.refreshUsers(), store.refreshLedger()]);
}

async function checkIn() {
  try {
    const result = await store.checkIn();
    ElMessage.success(
      result.ledger ? t("credits.checkInSuccess") : t("credits.checkedIn"),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

function refreshLedgerFromFirstPage() {
  store.ledgerFilters.page = 1;
  void store.refreshLedger();
}

function refreshUsersFromFirstPage() {
  store.userFilters.page = 1;
  void store.refreshUsers();
}

function filterLedger(userId: string) {
  store.ledgerFilters.userId = userId;
  refreshLedgerFromFirstPage();
}

function clearLedgerFilter() {
  store.ledgerFilters.userId = "";
  refreshLedgerFromFirstPage();
}

function openAdjust(userId: string) {
  adjustForm.userId = userId;
  adjustForm.amountUsd = 1;
  adjustForm.description = "";
  adjustOpen.value = true;
}

async function adjust() {
  try {
    store.saving = true;
    await store.adjust({ ...adjustForm });
    adjustOpen.value = false;
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    store.saving = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>
