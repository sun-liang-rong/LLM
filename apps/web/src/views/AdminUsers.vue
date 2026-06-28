<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("adminUsers.title") }}</h2>
        <p>{{ t("adminUsers.subtitle") }}</p>
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

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("adminUsers.users") }}</h3>
        <el-input
          v-model="credits.userFilters.email"
          clearable
          :placeholder="t('tenancy.userEmail')"
          class="filter-control"
          @keyup.enter="refreshFromFirstPage"
          @clear="refreshFromFirstPage"
        />
      </div>
      <el-table :data="credits.userRows">
        <el-table-column prop="email" :label="t('tenancy.userEmail')" min-width="220" />
        <el-table-column prop="name" :label="t('tenancy.userName')" min-width="140" />
        <el-table-column :label="t('credits.balance')" width="150">
          <template #default="{ row }">{{ money(row.balanceUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('credits.totalGranted')" width="150">
          <template #default="{ row }">{{ money(row.totalGrantedUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('credits.totalUsed')" width="150">
          <template #default="{ row }">{{ money(row.totalUsedUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('credits.todayStatus')" width="130">
          <template #default="{ row }">
            <el-tag :type="row.todayCheckedIn ? 'success' : 'info'">
              {{
                row.todayCheckedIn
                  ? t("credits.checkedIn")
                  : t("credits.notCheckedIn")
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.disabled ? 'danger' : 'success'">
              {{ row.disabled ? t("common.disabled") : t("common.enabled") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="360" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAdjust(row.userId)">
              {{ t("credits.adjust") }}
            </el-button>
            <el-button link type="primary" @click="filterLedger(row.userId)">
              {{ t("credits.ledger") }}
            </el-button>
            <el-button link type="warning" @click="resetCheckIn(row)">
              {{ t("adminUsers.resetCheckIn") }}
            </el-button>
            <el-button
              link
              :type="row.disabled ? 'success' : 'danger'"
              @click="toggleDisabled(row)"
            >
              {{ row.disabled ? t("adminUsers.enableUser") : t("adminUsers.disableUser") }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="credits.userFilters.page"
          v-model:page-size="credits.userFilters.pageSize"
          :total="credits.userTotal"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="credits.refreshUsers"
          @size-change="refreshFromFirstPage"
        />
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("credits.ledger") }}</h3>
        <el-button
          v-if="credits.ledgerFilters.userId"
          link
          type="primary"
          @click="clearLedgerFilter"
        >
          {{ t("credits.clearFilter") }}
        </el-button>
      </div>
      <el-table :data="credits.ledgerRows">
        <el-table-column prop="createdAt" :label="t('requests.time')" min-width="190">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="userEmail" :label="t('tenancy.userEmail')" min-width="220" />
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
          v-model:current-page="credits.ledgerFilters.page"
          v-model:page-size="credits.ledgerFilters.pageSize"
          :total="credits.ledgerTotal"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="credits.refreshLedger"
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
        <el-button type="primary" :loading="credits.saving" @click="adjust">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetOpen"
      :title="t('adminUsers.resetCheckIn')"
      width="460px"
      class="reset-checkin-dialog"
    >
      <div v-if="resetTarget" class="reset-checkin-body">
        <div class="reset-checkin-icon">{{ resetTarget.todayCheckedIn ? "OK" : "!" }}</div>
        <div>
          <h4>{{ t("adminUsers.resetCheckInTitle") }}</h4>
          <p>{{ t("adminUsers.resetCheckInDescription") }}</p>
          <dl>
            <div>
              <dt>{{ t("tenancy.userEmail") }}</dt>
              <dd>{{ resetTarget.email }}</dd>
            </div>
            <div>
              <dt>{{ t("credits.todayStatus") }}</dt>
              <dd>
                {{
                  resetTarget.todayCheckedIn
                    ? t("credits.checkedIn")
                    : t("credits.notCheckedIn")
                }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <template #footer>
        <el-button @click="resetOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button
          type="warning"
          :loading="credits.saving"
          @click="confirmResetCheckIn"
        >
          {{ t("adminUsers.confirmResetCheckIn") }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "../i18n";
import { useCreditsStore } from "../stores/credits";
import { formatUsd } from "../utils/money";
import type { AdminCreditUser } from "@gateway/shared";

const { t } = useI18n();
const credits = useCreditsStore();
const adjustOpen = ref(false);
const resetOpen = ref(false);
const resetTarget = ref<AdminCreditUser | null>(null);
const adjustForm = reactive({
  userId: "",
  amountUsd: 1,
  description: "",
});

const money = formatUsd;

function ledgerType(type: string) {
  const mapping: Record<string, string> = {
    signup_bonus: t("credits.type.signup_bonus"),
    checkin: t("credits.type.checkin"),
    usage: t("credits.type.usage"),
    admin_adjust: t("credits.type.admin_adjust"),
    expired: t("credits.type.expired"),
  };
  return mapping[type] ?? type;
}

async function refresh() {
  await Promise.all([
    credits.refreshUsers(),
    credits.refreshLedger(),
  ]);
}

function refreshFromFirstPage() {
  credits.userFilters.page = 1;
  void credits.refreshUsers();
}

function refreshLedgerFromFirstPage() {
  credits.ledgerFilters.page = 1;
  void credits.refreshLedger();
}

function filterLedger(userId: string) {
  credits.ledgerFilters.userId = userId;
  refreshLedgerFromFirstPage();
}

function clearLedgerFilter() {
  credits.ledgerFilters.userId = "";
  refreshLedgerFromFirstPage();
}

function openAdjust(userId: string) {
  adjustForm.userId = userId;
  adjustForm.amountUsd = 1;
  adjustForm.description = "";
  adjustOpen.value = true;
}

function resetCheckIn(row: AdminCreditUser) {
  resetTarget.value = row;
  resetOpen.value = true;
}

async function adjust() {
  try {
    credits.saving = true;
    await credits.adjust({ ...adjustForm });
    adjustOpen.value = false;
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    credits.saving = false;
  }
}

async function confirmResetCheckIn() {
  if (!resetTarget.value) return;
  try {
    credits.saving = true;
    const result = await credits.resetCheckIn(resetTarget.value.userId);
    resetOpen.value = false;
    ElMessage.success(
      result.reset
        ? t("adminUsers.resetCheckInSuccess")
        : t("adminUsers.resetCheckInNoop"),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    credits.saving = false;
  }
}

async function toggleDisabled(row: AdminCreditUser) {
  try {
    credits.saving = true;
    await credits.setUserDisabled(row.userId, !row.disabled);
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    credits.saving = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>
