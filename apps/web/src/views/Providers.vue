<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("providers.title") }}</h2>
        <p>{{ t("providers.subtitle") }}</p>
      </div>
      <div class="actions">
        <el-button :loading="store.loading" @click="store.refresh">
          {{ t("common.refresh") }}
        </el-button>
        <el-button
          v-if="auth.canManageBudgets"
          type="primary"
          :icon="Plus"
          @click="openCreateProvider"
        >
          {{ t("providers.addProvider") }}
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

    <el-empty
      v-if="!store.loading && store.rows.length === 0"
      :description="t('providers.empty')"
    >
      <el-button
        v-if="auth.canManageBudgets"
        type="primary"
        :icon="Plus"
        @click="openCreateProvider"
      >
        {{ t("providers.addProvider") }}
      </el-button>
    </el-empty>

    <section v-for="provider in store.rows" :key="provider.id" class="panel">
      <div class="panel-title">
        <div>
          <div class="title-row">
            <h3>{{ provider.name }}</h3>
            <el-tag size="small" :type="protocolTagType(provider.protocol)">
              {{ protocolLabel(provider.protocol) }}
            </el-tag>
          </div>
          <p>{{ provider.slug ?? provider.provider }} · {{ provider.baseUrl }}</p>
        </div>
        <div class="actions table-actions">
          <el-tag :type="provider.enabled ? 'success' : 'info'">
            {{ provider.enabled ? t("common.enabled") : t("common.disabled") }}
          </el-tag>
          <el-tooltip :content="t('common.edit')" placement="top">
            <el-button
              v-if="auth.canManageBudgets"
              :icon="Edit"
              :aria-label="t('common.edit')"
              @click="openEditProvider(provider)"
            />
          </el-tooltip>
          <el-tooltip :content="t('providers.resetKeys')" placement="top">
            <el-button
              v-if="auth.canOperateRoutes"
              :icon="RefreshLeft"
              :aria-label="t('providers.resetKeys')"
              @click="resetProviderKeys(provider.id)"
            />
          </el-tooltip>
          <el-tooltip :content="t('providers.addKey')" placement="top">
            <el-button
              v-if="auth.canOperateRoutes"
              type="primary"
              :icon="Plus"
              :aria-label="t('providers.addKey')"
              @click="openCreateKey(provider.id)"
            />
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button
              v-if="auth.canManageBudgets"
              :icon="Delete"
              type="danger"
              :aria-label="t('common.delete')"
              @click="deleteProvider(provider.id)"
            />
          </el-tooltip>
        </div>
      </div>

      <div class="summary-strip">
        <div class="summary-item">
          <span>{{ t("providers.keyTotal") }}</span>
          <strong>{{ provider.keys.length }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t("providers.keyAvailable") }}</span>
          <strong>{{ providerAvailableKeys(provider) }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t("providers.windowRemaining") }}</span>
          <strong>{{ providerWindowRemaining(provider) }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t("providers.authMode") }}</span>
          <strong>{{ authSummary(provider.protocol) }}</strong>
        </div>
      </div>

      <el-table :data="pagedProviderKeys(provider)" :empty-text="t('providers.noKeys')">
        <el-table-column prop="name" :label="t('common.name')" min-width="180" />
        <el-table-column :label="t('common.status')" width="130">
          <template #default="{ row }">
            <el-tag :type="row.status === 'healthy' ? 'success' : 'warning'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" :label="t('providers.weight')" width="90" />
        <el-table-column :label="t('providers.windowUsage')" min-width="220">
          <template #default="{ row }">
            <div class="window-cell">
              <el-progress
                :percentage="windowPercent(row)"
                :status="windowPercent(row) >= 100 ? 'exception' : undefined"
                :stroke-width="8"
              />
              <span>
                {{ row.windowRequestCount ?? 0 }} / {{ row.windowRequestLimit ?? 0 }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('providers.windowReset')" width="180">
          <template #default="{ row }">
            {{ row.windowResetAt ? new Date(row.windowResetAt).toLocaleString() : "" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('providers.cooldown')" width="180">
          <template #default="{ row }">
            {{ row.cooldownUntil ? new Date(row.cooldownUntil).toLocaleString() : "" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('providers.lastError')" min-width="240">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.lastError"
              :content="row.lastError"
              placement="top"
            >
              <span class="truncate-text error-text">{{ row.lastError }}</span>
            </el-tooltip>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="230" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-tooltip :content="t('providers.toggleKey')" placement="top">
                <el-button
                  v-if="auth.canOperateRoutes"
                  :icon="SwitchButton"
                  :aria-label="t('providers.toggleKey')"
                  @click="toggleKey(row)"
                />
              </el-tooltip>
              <el-tooltip :content="t('common.reset')" placement="top">
                <el-button
                  v-if="auth.canOperateRoutes"
                  :icon="RefreshLeft"
                  :aria-label="t('common.reset')"
                  @click="resetKey(row.id)"
                />
              </el-tooltip>
              <el-tooltip :content="t('common.delete')" placement="top">
                <el-button
                  v-if="auth.canManageBudgets"
                  :icon="Delete"
                  type="danger"
                  :aria-label="t('common.delete')"
                  @click="deleteKey(row.id)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="keyPagination(provider.id).page"
          v-model:page-size="keyPagination(provider.id).pageSize"
          :total="provider.keys.length"
          :page-sizes="[5, 10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          small
        />
      </div>
    </section>

    <div v-if="store.total > 0" class="pagination-row">
      <el-pagination
        v-model:current-page="store.filters.page"
        v-model:page-size="store.filters.pageSize"
        :total="store.total"
        :page-sizes="[5, 10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="store.refresh"
        @size-change="handleProviderPageSizeChange"
      />
    </div>

    <el-drawer
      v-if="auth.canManageBudgets"
      v-model="providerDrawerOpen"
      :title="providerForm.id ? t('providers.editProvider') : t('providers.addProvider')"
      size="460px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('common.name')">
          <el-input v-model="providerForm.name" placeholder="My Upstream" />
        </el-form-item>
        <el-form-item :label="t('providers.slug')">
          <el-input v-model="providerForm.slug" placeholder="my-upstream" />
        </el-form-item>
        <el-form-item :label="t('providers.baseUrl')">
          <el-input v-model="providerForm.baseUrl" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item :label="t('providers.protocol')">
          <el-select v-model="providerForm.protocol" class="full-width">
            <el-option
              :label="t('providers.openaiCompatible')"
              value="openai-compatible"
            />
            <el-option label="Anthropic" value="anthropic" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-switch
            v-model="providerForm.enabled"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
        </el-form-item>

        <el-divider v-if="!providerForm.id" />

        <template v-if="!providerForm.id">
          <el-form-item :label="t('providers.firstKeyName')">
            <el-input v-model="providerForm.keyName" placeholder="key 1" />
          </el-form-item>
          <el-form-item :label="t('providers.secret')">
            <el-input
              v-model="providerForm.secret"
              type="password"
              show-password
              placeholder="sk-..."
            />
          </el-form-item>
          <div class="form-grid">
            <el-form-item :label="t('providers.windowSize')">
              <el-input-number v-model="providerForm.windowSizeMinutes" :min="1" />
            </el-form-item>
            <el-form-item :label="t('providers.windowLimit')">
              <el-input-number v-model="providerForm.windowRequestLimit" :min="1" />
            </el-form-item>
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="providerDrawerOpen = false">
          {{ t("common.cancel") }}
        </el-button>
        <el-button type="primary" :loading="savingProvider" @click="saveProvider">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <el-drawer
      v-if="auth.canOperateRoutes"
      v-model="drawerOpen"
      :title="t('providers.addKey')"
      size="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('common.name')">
          <el-input v-model="form.name" placeholder="main key" />
        </el-form-item>
        <el-form-item :label="t('providers.secret')">
          <el-input
            v-model="form.secret"
            type="password"
            show-password
            placeholder="sk-..."
          />
        </el-form-item>
        <el-form-item :label="t('providers.weight')">
          <el-input-number v-model="form.weight" :min="1" :max="100" />
        </el-form-item>
        <el-form-item :label="t('providers.rpm')">
          <el-input-number v-model="form.rpmLimit" :min="0" />
        </el-form-item>
        <el-form-item :label="t('providers.tpm')">
          <el-input-number v-model="form.tpmLimit" :min="0" />
        </el-form-item>
        <el-form-item :label="t('providers.dailyBudget')">
          <el-input-number v-model="form.dailyBudgetUsd" :min="0" :step="1" />
        </el-form-item>
        <el-form-item :label="t('providers.windowSize')">
          <el-input-number v-model="form.windowSizeMinutes" :min="1" />
        </el-form-item>
        <el-form-item :label="t('providers.windowLimit')">
          <el-input-number v-model="form.windowRequestLimit" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveKey">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  Delete,
  Edit,
  Plus,
  RefreshLeft,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import {
  type ProviderKeyRow,
  type ProviderRow,
  useProvidersStore,
} from "../stores/providers";
import { normalizeProviderPayload } from "../utils/provider-form";

const auth = useAuthStore();
const store = useProvidersStore();
const { t } = useI18n();
const providerDrawerOpen = ref(false);
const drawerOpen = ref(false);
const savingProvider = ref(false);
const saving = ref(false);
const selectedProviderId = ref("");
const keyPagers = reactive(
  {} as Record<string, { page: number; pageSize: number }>,
);

const providerForm = reactive({
  id: "",
  name: "",
  slug: "",
  protocol: "openai-compatible",
  baseUrl: "",
  enabled: true,
  keyName: "key 1",
  secret: "",
  windowSizeMinutes: 300,
  windowRequestLimit: 500,
});

const form = reactive({
  name: "",
  secret: "",
  weight: 1,
  rpmLimit: undefined as number | undefined,
  tpmLimit: undefined as number | undefined,
  dailyBudgetUsd: undefined as number | undefined,
  windowSizeMinutes: 300,
  windowRequestLimit: 500,
});

function resetProviderForm() {
  providerForm.id = "";
  providerForm.name = "";
  providerForm.slug = "";
  providerForm.protocol = "openai-compatible";
  providerForm.baseUrl = "";
  providerForm.enabled = true;
  providerForm.keyName = "key 1";
  providerForm.secret = "";
  providerForm.windowSizeMinutes = 300;
  providerForm.windowRequestLimit = 500;
}

function openCreateProvider() {
  resetProviderForm();
  providerDrawerOpen.value = true;
}

function openEditProvider(provider: ProviderRow) {
  providerForm.id = provider.id;
  providerForm.name = provider.name;
  providerForm.slug = provider.slug ?? provider.provider;
  providerForm.protocol = provider.protocol ?? "openai-compatible";
  providerForm.baseUrl = provider.baseUrl;
  providerForm.enabled = provider.enabled;
  providerForm.keyName = "";
  providerForm.secret = "";
  providerDrawerOpen.value = true;
}

function protocolLabel(protocol?: string) {
  return protocol === "anthropic" ? "Anthropic" : t("providers.openaiCompatible");
}

function protocolTagType(protocol?: string) {
  return protocol === "anthropic" ? "warning" : "primary";
}

function authSummary(protocol?: string) {
  return protocol === "anthropic"
    ? t("providers.authAnthropic")
    : t("providers.authOpenAi");
}

function providerAvailableKeys(provider: ProviderRow) {
  return provider.keys.filter(
    (key) =>
      key.status === "healthy" &&
      (key.windowRemaining ?? key.windowRequestLimit ?? 0) > 0,
  ).length;
}

function providerWindowRemaining(provider: ProviderRow) {
  return provider.keys.reduce(
    (sum, key) => sum + Math.max(key.windowRemaining ?? 0, 0),
    0,
  );
}

function windowPercent(row: ProviderKeyRow) {
  const limit = row.windowRequestLimit ?? 0;
  if (limit <= 0) {
    return 0;
  }
  return Math.min(Math.round(((row.windowRequestCount ?? 0) / limit) * 100), 100);
}

function keyPagination(providerId: string) {
  keyPagers[providerId] ??= { page: 1, pageSize: 10 };
  return keyPagers[providerId];
}

function pagedProviderKeys(provider: ProviderRow) {
  const pager = keyPagination(provider.id);
  const maxPage = Math.max(Math.ceil(provider.keys.length / pager.pageSize), 1);
  if (pager.page > maxPage) {
    pager.page = maxPage;
  }
  const start = (pager.page - 1) * pager.pageSize;
  return provider.keys.slice(start, start + pager.pageSize);
}

async function saveProvider() {
  savingProvider.value = true;
  try {
    const result = normalizeProviderPayload({
      id: providerForm.id || undefined,
      name: providerForm.name,
      slug: providerForm.slug,
      protocol: providerForm.protocol,
      baseUrl: providerForm.baseUrl,
      enabled: providerForm.enabled,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }

    const savedProvider = await store.saveProvider(result.payload);

    if (!providerForm.id && providerForm.secret) {
      await store.createKey({
        providerId: savedProvider.id,
        name: providerForm.keyName || "key 1",
        secret: providerForm.secret,
        weight: 1,
        windowSizeMinutes: providerForm.windowSizeMinutes,
        windowRequestLimit: providerForm.windowRequestLimit,
      });
    }

    providerDrawerOpen.value = false;
    ElMessage.success(t("providers.providerSaved"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    savingProvider.value = false;
  }
}

function openCreateKey(providerId: string) {
  selectedProviderId.value = providerId;
  form.name = "";
  form.secret = "";
  form.weight = 1;
  form.rpmLimit = undefined;
  form.tpmLimit = undefined;
  form.dailyBudgetUsd = undefined;
  form.windowSizeMinutes = 300;
  form.windowRequestLimit = 500;
  drawerOpen.value = true;
}

async function saveKey() {
  saving.value = true;
  try {
    await store.createKey({
      providerId: selectedProviderId.value,
      name: form.name,
      secret: form.secret,
      weight: form.weight,
      rpmLimit: form.rpmLimit,
      tpmLimit: form.tpmLimit,
      dailyBudgetUsd: form.dailyBudgetUsd,
      windowSizeMinutes: form.windowSizeMinutes,
      windowRequestLimit: form.windowRequestLimit,
    });
    drawerOpen.value = false;
    ElMessage.success(t("providers.keySaved"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function toggleKey(row: ProviderKeyRow) {
  const status = row.status === "healthy" ? "disabled" : "healthy";
  await ElMessageBox.confirm(
    status === "healthy"
      ? t("providers.enableKeyConfirm")
      : t("providers.disableKeyConfirm"),
    t("common.confirm"),
    { type: "warning" },
  );
  await store.updateKey(row.id, { status });
}

async function resetKey(id: string) {
  await store.resetKey(id);
  ElMessage.success(t("providers.keyReset"));
}

async function resetProviderKeys(id: string) {
  await store.resetProviderKeys(id);
  ElMessage.success(t("providers.keysReset"));
}

async function deleteProvider(id: string) {
  await ElMessageBox.confirm(
    t("providers.deleteProviderConfirm"),
    t("common.confirm"),
    { type: "warning" },
  );
  await store.deleteProvider(id);
}

async function deleteKey(id: string) {
  await ElMessageBox.confirm(t("providers.deleteConfirm"), t("common.confirm"), {
    type: "warning",
  });
  await store.deleteKey(id);
}

function handleProviderPageSizeChange() {
  store.filters.page = 1;
  void store.refresh();
}

onMounted(() => {
  void Promise.all([store.refresh(), store.refreshAll()]);
});
</script>
