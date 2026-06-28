<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("apiKeys.title") }}</h2>
        <p>{{ t("apiKeys.subtitle") }}</p>
      </div>
      <div class="actions">
        <el-button :loading="store.loading" @click="store.refresh">
          {{ t("common.refresh") }}
        </el-button>
        <el-button
          v-if="auth.canManageApiKeys"
          type="primary"
          :icon="Plus"
          @click="openDrawer"
        />
      </div>
    </div>

    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      show-icon
      class="mb"
    />

    <section class="panel">
      <el-table :data="store.rows" :empty-text="t('apiKeys.noKeys')">
        <el-table-column prop="name" :label="t('common.name')" min-width="180" />
        <el-table-column :label="t('apiKeys.key')" min-width="290">
          <template #default="{ row }">
            <div class="key-cell">
              <code class="inline-code">{{ row.key ?? row.keyPrefix ?? "-" }}</code>
              <el-button
                v-if="row.key"
                :icon="CopyDocument"
                link
                type="primary"
                :aria-label="t('common.copy')"
                @click="copyText(row.key)"
              />
              <el-tag v-else size="small" type="info">
                {{ t("apiKeys.unrecoverable") }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.billingGroup')" min-width="180">
          <template #default="{ row }">
            <div class="token-cell">
              <strong>{{ groupLabel(row) }}</strong>
              <span>{{ Number(row.billingMultiplier ?? 1).toFixed(2) }}x</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.usage')" width="170">
          <template #default="{ row }">
            <div class="token-cell">
              <strong>${{ Number(row.usage?.dailySpentUsd ?? 0).toFixed(4) }}</strong>
              <span>{{ t("apiKeys.dailySpent") }}</span>
              <span>${{ Number(row.usage?.monthlySpentUsd ?? 0).toFixed(4) }} {{ t("apiKeys.monthlySpent") }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.rateLimit')" width="150">
          <template #default="{ row }">
            {{ rateLimitText(row) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.expiresAt')" width="170">
          <template #default="{ row }">
            {{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : t("apiKeys.neverExpires") }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? t("common.enabled") : t("common.disabled") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.lastUsed')" width="190">
          <template #default="{ row }">
            {{ row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : "-" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('apiKeys.createdAt')" width="190">
          <template #default="{ row }">
            {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : "-" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="auth.canManageApiKeys"
              :icon="Edit"
              :aria-label="t('apiKeys.editBillingGroup')"
              @click="openBillingGroupDialog(row)"
            />
            <el-button
              v-if="auth.canManageApiKeys"
              :icon="SwitchButton"
              :aria-label="row.enabled ? t('apiKeys.disableConfirm') : t('apiKeys.enableConfirm')"
              @click="toggle(row)"
            />
            <el-button
              v-if="auth.canManageApiKeys"
              :icon="Delete"
              type="danger"
              :aria-label="t('common.delete')"
              @click="deleteKey(row.id)"
            />
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="store.filters.page"
          v-model:page-size="store.filters.pageSize"
          :total="store.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="store.refresh"
          @size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="billingGroupDialogOpen"
      :title="t('apiKeys.editBillingGroup')"
      width="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('apiKeys.keyName')">
          <el-input v-model="billingGroupForm.name" readonly />
        </el-form-item>
        <el-form-item :label="t('apiKeys.selectBillingGroup')" required>
          <el-select
            v-model="billingGroupForm.billingGroupId"
            class="full-width"
            :loading="store.loading"
            :placeholder="t('apiKeys.selectBillingGroup')"
          >
            <el-option
              v-for="group in store.billingGroups"
              :key="group.id"
              :label="`${group.name} · ${group.multiplier}x`"
              :value="group.id"
            />
          </el-select>
          <p v-if="store.billingGroups.length === 0" class="muted form-hint">
            {{ t("apiKeys.noBillingGroupsHint") }}
          </p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="billingGroupDialogOpen = false">
          {{ t("common.cancel") }}
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!billingGroupForm.billingGroupId"
          @click="saveBillingGroup"
        >
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerOpen" :title="t('apiKeys.createTitle')" size="420px">
      <el-form label-position="top">
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="form.name" placeholder="cline desktop" />
        </el-form-item>
        <el-form-item :label="t('apiKeys.selectBillingGroup')" required>
          <el-select
            v-model="form.billingGroupId"
            class="full-width"
            :loading="store.loading"
            :placeholder="t('apiKeys.selectBillingGroup')"
          >
            <el-option
              v-for="group in store.billingGroups"
              :key="group.id"
              :label="`${group.name} · ${group.multiplier}x`"
              :value="group.id"
            />
          </el-select>
          <p v-if="store.billingGroups.length === 0" class="muted form-hint">
            {{ t("apiKeys.noBillingGroupsHint") }}
          </p>
        </el-form-item>
        <el-form-item :label="t('apiKeys.customKey')">
          <el-input v-model="form.customKey" placeholder="gw_live_custom_value" />
        </el-form-item>
        <el-form-item :label="t('apiKeys.ipAllowlist')">
          <el-input
            v-model="form.ipAllowlist"
            type="textarea"
            :rows="3"
            :placeholder="t('apiKeys.ipAllowlistPlaceholder')"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('apiKeys.dailyBudget')">
            <el-input-number v-model="form.dailyBudgetUsd" :min="0" :step="1" />
          </el-form-item>
          <el-form-item :label="t('apiKeys.monthlyBudget')">
            <el-input-number v-model="form.monthlyBudgetUsd" :min="0" :step="10" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item :label="t('apiKeys.rateLimitRpm')">
            <el-input-number v-model="form.rateLimitRpm" :min="0" :step="10" />
          </el-form-item>
          <el-form-item :label="t('apiKeys.rateLimitTpm')">
            <el-input-number v-model="form.rateLimitTpm" :min="0" :step="1000" />
          </el-form-item>
        </div>
        <el-form-item :label="t('apiKeys.expiresAt')">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            class="full-width"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            :placeholder="t('apiKeys.neverExpires')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!form.name.trim() || !form.billingGroupId"
          @click="save"
        >
          {{ t("common.create") }}
        </el-button>
      </template>
    </el-drawer>

    <el-dialog v-model="createdOpen" :title="t('apiKeys.createdTitle')" width="560px">
      <el-alert
        :title="t('apiKeys.createdWarning')"
        type="warning"
        show-icon
        class="mb"
      />
      <div class="copy-input">
        <el-input v-model="createdKey" readonly />
        <el-button :icon="CopyDocument" @click="copyText(createdKey)">
          {{ t("common.copy") }}
        </el-button>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import {
  CopyDocument,
  Delete,
  Edit,
  Plus,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "../i18n";
import { type ApiKeyRow, useApiKeysStore } from "../stores/api-keys";
import { useAuthStore } from "../stores/auth";

const store = useApiKeysStore();
const auth = useAuthStore();
const { t } = useI18n();
const drawerOpen = ref(false);
const createdOpen = ref(false);
const billingGroupDialogOpen = ref(false);
const createdKey = ref("");
const saving = ref(false);

const form = reactive({
  name: "",
  tenantId: "default",
  billingGroupId: "",
  customKey: "",
  ipAllowlist: "",
  dailyBudgetUsd: undefined as number | undefined,
  monthlyBudgetUsd: undefined as number | undefined,
  rateLimitRpm: undefined as number | undefined,
  rateLimitTpm: undefined as number | undefined,
  expiresAt: "",
});

const billingGroupForm = reactive({
  id: "",
  name: "",
  billingGroupId: "",
});

async function openDrawer() {
  form.name = "";
  await store.refreshBillingGroups();
  form.tenantId = "default";
  form.billingGroupId =
    store.billingGroups.find((group) => group.isDefault)?.id ??
    store.billingGroups[0]?.id ??
    "";
  form.customKey = "";
  form.ipAllowlist = "";
  form.dailyBudgetUsd = undefined;
  form.monthlyBudgetUsd = undefined;
  form.rateLimitRpm = undefined;
  form.rateLimitTpm = undefined;
  form.expiresAt = "";
  drawerOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning(t("apiKeys.nameRequired"));
    return;
  }
  if (!form.billingGroupId) {
    ElMessage.warning(t("apiKeys.selectBillingGroupRequired"));
    return;
  }
  saving.value = true;
  try {
    const created = await store.create({
      name: form.name,
      tenantId: form.tenantId,
      billingGroupId: form.billingGroupId,
      customKey: form.customKey || undefined,
      ipAllowlist: form.ipAllowlist || undefined,
      dailyBudgetUsd: form.dailyBudgetUsd,
      monthlyBudgetUsd: form.monthlyBudgetUsd,
      rateLimitRpm: form.rateLimitRpm,
      rateLimitTpm: form.rateLimitTpm,
      expiresAt: form.expiresAt || undefined,
    });
    createdKey.value = created.key;
    drawerOpen.value = false;
    createdOpen.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
  ElMessage.success(t("common.copied"));
}

function groupLabel(row: ApiKeyRow) {
  return row.billingGroupName ?? store.billingGroupNameById(row.billingGroupId);
}

function rateLimitText(row: ApiKeyRow) {
  const parts: string[] = [];
  if (row.rateLimitRpm) parts.push(`${row.rateLimitRpm} RPM`);
  if (row.rateLimitTpm) parts.push(`${row.rateLimitTpm} TPM`);
  return parts.length > 0 ? parts.join(" / ") : "-";
}

async function openBillingGroupDialog(row: ApiKeyRow) {
  await store.refreshBillingGroups();
  billingGroupForm.id = row.id;
  billingGroupForm.name = row.name;
  billingGroupForm.billingGroupId = row.billingGroupId ?? "";
  billingGroupDialogOpen.value = true;
}

async function saveBillingGroup() {
  if (!billingGroupForm.id || !billingGroupForm.billingGroupId) {
    ElMessage.warning(t("apiKeys.selectBillingGroupRequired"));
    return;
  }
  saving.value = true;
  try {
    await store.update(billingGroupForm.id, {
      billingGroupId: billingGroupForm.billingGroupId,
    });
    billingGroupDialogOpen.value = false;
    ElMessage.success(t("pricing.groupAssigned"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function toggle(row: ApiKeyRow) {
  await ElMessageBox.confirm(
    row.enabled ? t("apiKeys.disableConfirm") : t("apiKeys.enableConfirm"),
    t("common.confirm"),
    { type: "warning" },
  );
  await store.update(row.id, { enabled: !row.enabled });
}

async function deleteKey(id: string) {
  await ElMessageBox.confirm(t("apiKeys.deleteConfirm"), t("common.confirm"), {
    type: "warning",
  });
  await store.delete(id);
}

function handlePageSizeChange() {
  store.filters.page = 1;
  void store.refresh();
}

onMounted(() => {
  void store.refresh();
  void store.refreshBillingGroups();
});
</script>
