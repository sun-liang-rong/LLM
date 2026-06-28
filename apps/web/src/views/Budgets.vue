<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("nav.budgets") }}</h2>
        <p>{{ t("budgets.subtitle") }}</p>
      </div>
      <div class="actions">
        <el-button :loading="store.loading" @click="refresh">
          {{ t("common.refresh") }}
        </el-button>
        <el-button
          v-if="auth.canManageBudgets"
          type="primary"
          :icon="Plus"
          @click="drawerOpen = true"
        >
          {{ t("budgets.add") }}
        </el-button>
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
      <div class="panel-title">
        <h3>{{ t("budgets.alerts") }}</h3>
        <span class="panel-meta">{{ store.alerts.length }}</span>
      </div>
      <div v-if="store.alerts.length > 0" class="alert-list">
        <article v-for="alert in store.alerts" :key="alert.id" class="alert-card">
          <div class="title-row">
            <strong>{{ alert.title }}</strong>
            <el-tag :type="alert.level === 'critical' ? 'danger' : 'warning'">
              {{ alert.level }}
            </el-tag>
          </div>
          <p>{{ alert.description }}</p>
        </article>
      </div>
      <el-empty v-else :description="t('budgets.noAlerts')" class="dashboard-empty" />
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("budgets.usage") }}</h3>
        <span class="panel-meta">{{ store.usage.length }}</span>
      </div>
      <el-table :data="store.usage">
        <el-table-column prop="scope" :label="t('budgets.scope')" width="120" />
        <el-table-column prop="scopeId" :label="t('budgets.scopeId')" min-width="180" />
        <el-table-column :label="t('budgets.dailySpent')" width="140">
          <template #default="{ row }">${{ Number(row.dailySpentUsd ?? 0).toFixed(4) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.dailyBudget')" width="140">
          <template #default="{ row }">{{ money(row.dailyBudgetUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.monthlySpent')" width="140">
          <template #default="{ row }">${{ Number(row.monthlySpentUsd ?? 0).toFixed(4) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.monthlyBudget')" width="140">
          <template #default="{ row }">{{ money(row.monthlyBudgetUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.action')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.action === 'reject' ? 'danger' : 'warning'">
              {{ row.action }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('budgets.fallbackModel')" min-width="160">
          <template #default="{ row }">
            {{ row.downgradeModelAlias || "-" }}
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("budgets.rules") }}</h3>
        <span class="panel-meta">{{ store.rules.length }}</span>
      </div>
      <el-table :data="store.rules">
        <el-table-column prop="scope" :label="t('budgets.scope')" width="120" />
        <el-table-column prop="scopeId" :label="t('budgets.scopeId')" min-width="180" />
        <el-table-column :label="t('budgets.dailyBudget')" width="140">
          <template #default="{ row }">{{ money(row.dailyUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.monthlyBudget')" width="140">
          <template #default="{ row }">{{ money(row.monthlyUsd) }}</template>
        </el-table-column>
        <el-table-column :label="t('budgets.action')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.action === 'reject' ? 'danger' : 'warning'">
              {{ row.action }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('budgets.fallbackModel')" min-width="160">
          <template #default="{ row }">
            {{ row.downgradeModelAlias || "-" }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="auth.canManageBudgets"
          :label="t('common.actions')"
          width="120"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button :icon="Delete" type="danger" @click="remove(row.id)" />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer
      v-if="auth.canManageBudgets"
      v-model="drawerOpen"
      :title="t('budgets.add')"
      size="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('budgets.scope')">
          <el-select v-model="form.scope" class="full-width">
            <el-option :label="t('budgets.scopeTenant')" value="tenant" />
            <el-option :label="t('budgets.scopeProject')" value="project" />
            <el-option :label="t('budgets.scopeApiKey')" value="apiKey" />
            <el-option :label="t('budgets.scopeProvider')" value="provider" />
            <el-option :label="t('budgets.scopeModelAlias')" value="modelAlias" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('budgets.scopeId')">
          <el-input v-model="form.scopeId" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('budgets.dailyBudget')">
            <el-input-number v-model="form.dailyUsd" :min="0" :step="1" />
          </el-form-item>
          <el-form-item :label="t('budgets.monthlyBudget')">
            <el-input-number v-model="form.monthlyUsd" :min="0" :step="10" />
          </el-form-item>
        </div>
        <el-form-item :label="t('budgets.action')">
          <el-select v-model="form.action" class="full-width">
            <el-option :label="t('budgets.actionReject')" value="reject" />
            <el-option :label="t('budgets.actionWarn')" value="warn" />
            <el-option :label="t('budgets.actionDowngrade')" value="downgrade" />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="form.action === 'downgrade'"
          :label="t('budgets.fallbackModel')"
        >
          <el-input
            v-model="form.downgradeModelAlias"
            :placeholder="t('budgets.fallbackModelPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Delete, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useBudgetsStore } from "../stores/budgets";

const { t } = useI18n();
const auth = useAuthStore();
const store = useBudgetsStore();
const drawerOpen = ref(false);
const saving = ref(false);

const form = reactive({
  scope: "tenant",
  scopeId: "default",
  dailyUsd: undefined as number | undefined,
  monthlyUsd: undefined as number | undefined,
  action: "reject",
  downgradeModelAlias: "",
});

function money(value?: number) {
  return value == null ? "-" : `$${Number(value).toFixed(4)}`;
}

async function refresh() {
  await store.refresh(auth.user?.tenantId ?? "default");
}

async function save() {
  saving.value = true;
  try {
    await store.save({
      tenantId: auth.user?.tenantId ?? "default",
      scope: form.scope,
      scopeId: form.scopeId,
      dailyUsd: form.dailyUsd,
      monthlyUsd: form.monthlyUsd,
      action: form.action,
      downgradeModelAlias:
        form.action === "downgrade" ? form.downgradeModelAlias : undefined,
    });
    drawerOpen.value = false;
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  await ElMessageBox.confirm(t("common.confirm"), t("common.confirm"), {
    type: "warning",
  });
  await store.delete(id, auth.user?.tenantId ?? "default");
}

onMounted(() => {
  void refresh();
});
</script>
