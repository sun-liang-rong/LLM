<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("modelRoutes.title") }}</h2>
        <p>{{ t("modelRoutes.subtitle") }}</p>
      </div>
      <div class="actions">
        <el-button :loading="aliases.loading || providers.loading" @click="refresh">
          {{ t("common.refresh") }}
        </el-button>
        <el-button
          v-if="auth.canOperateRoutes"
          type="primary"
          :icon="Plus"
          @click="openCreate"
        >
          {{ t("modelRoutes.add") }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="aliases.error || providers.error"
      :title="aliases.error || providers.error"
      type="error"
      show-icon
      class="mb"
    />

    <section class="panel">
      <el-table :data="aliases.rows" :empty-text="t('modelRoutes.empty')">
        <el-table-column prop="alias" :label="t('modelRoutes.clientModel')" min-width="180" />
        <el-table-column :label="t('common.provider')" min-width="180">
          <template #default="{ row }">
            {{ row.targets.map((item: RouteTarget) => item.providerSlug).join(", ") }}
          </template>
        </el-table-column>
        <el-table-column :label="t('providers.protocol')" width="170">
          <template #default="{ row }">
            {{ row.targets[0]?.upstreamProtocol }}
          </template>
        </el-table-column>
        <el-table-column :label="t('modelRoutes.upstreamModel')" min-width="180">
          <template #default="{ row }">
            {{ row.targets.map((item: RouteTarget) => item.upstreamModel).join(", ") }}
          </template>
        </el-table-column>
        <el-table-column prop="mode" :label="t('dashboard.mode')" width="120" />
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.targets[0]?.enabled ? 'success' : 'info'">
              {{ row.targets[0]?.enabled ? t("common.enabled") : t("common.disabled") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="260" fixed="right">
          <template #default="{ row }">
            <el-button
              :icon="View"
              :aria-label="t('modelRoutes.explain')"
              @click="explainAlias(row.alias)"
            />
            <el-button
              v-if="auth.canOperateRoutes"
              :icon="VideoPlay"
              :loading="testingAlias === row.alias"
              type="primary"
              :aria-label="t('modelRoutes.test')"
              @click="testAlias(row.alias)"
            />
            <el-button
              v-if="auth.canOperateRoutes"
              :icon="Edit"
              :aria-label="t('common.edit')"
              @click="openEdit(row)"
            />
            <el-button
              v-if="auth.canManageBudgets"
              :icon="Delete"
              type="danger"
              :aria-label="t('common.delete')"
              @click="deleteAlias(row.alias)"
            />
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="aliases.filters.page"
          v-model:page-size="aliases.filters.pageSize"
          :total="aliases.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="aliases.refresh"
          @size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <el-drawer
      v-if="auth.canOperateRoutes"
      v-model="drawerOpen"
      :title="t('modelRoutes.formTitle')"
      size="460px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('modelRoutes.clientModel')">
          <el-input v-model="form.alias" placeholder="claude-sonnet-4-5" />
        </el-form-item>
        <el-form-item :label="t('dashboard.mode')">
          <el-select v-model="form.mode" class="full-width">
            <el-option label="balanced" value="balanced" />
            <el-option label="cost" value="cost" />
            <el-option label="latency" value="latency" />
            <el-option label="quality" value="quality" />
          </el-select>
        </el-form-item>
        <div class="targets-editor">
          <div
            v-for="(target, index) in form.targets"
            :key="`${target.providerId}-${index}`"
            class="target-editor-card"
          >
            <div class="title-row">
              <strong>{{ t("dashboard.target") }} {{ index + 1 }}</strong>
              <el-button
                v-if="form.targets.length > 1"
                :icon="Delete"
                type="danger"
                @click="removeTarget(index)"
              />
            </div>
            <el-form-item :label="t('common.provider')">
              <el-select
                v-model="target.providerId"
                class="full-width"
                :placeholder="t('modelRoutes.selectProvider')"
              >
                <el-option
                  v-for="provider in providers.allProviders"
                  :key="provider.id"
                  :label="`${provider.name} (${provider.slug ?? provider.provider})`"
                  :value="provider.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('providers.protocol')">
              <el-input :model-value="providerProtocol(target.providerId)" disabled />
            </el-form-item>
            <el-form-item :label="t('modelRoutes.upstreamModel')">
              <el-input v-model="target.upstreamModel" placeholder="deepseek-chat" />
            </el-form-item>
            <div class="form-grid">
              <el-form-item :label="t('providers.weight')">
                <el-input-number v-model="target.weight" :min="1" :max="100" />
              </el-form-item>
              <el-form-item :label="t('dashboard.mode') + ' Priority'">
                <el-input-number v-model="target.priority" :min="1" :max="20" />
              </el-form-item>
            </div>
            <el-form-item :label="t('common.status')">
              <el-switch
                v-model="target.enabled"
                :active-text="t('common.enabled')"
                :inactive-text="t('common.disabled')"
              />
            </el-form-item>
          </div>
          <el-button :icon="Plus" @click="addTarget">
            {{ t("dashboard.target") }}
          </el-button>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="drawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveAlias">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <el-dialog v-model="explainOpen" :title="t('modelRoutes.explain')" width="680px">
      <div v-if="explainResult" class="route-diagnostics">
        <div
          v-if="testResult"
          class="diagnostic-banner"
          :class="testResult.ok ? 'diagnostic-banner-success' : 'diagnostic-banner-error'"
        >
          <div>
            <strong>
              {{ testResult.ok ? t("common.success") : t("common.failed") }}
            </strong>
            <span>{{ testResult.latencyMs }} ms</span>
          </div>
          <el-tag :type="testResult.ok ? 'success' : 'danger'">
            {{ testResult.statusCode ?? "-" }}
          </el-tag>
        </div>

        <div class="route-path">
          <span>{{ explainResult.requestedModel }}</span>
          <span>→</span>
          <span>{{ explainResult.providerSlug }}</span>
          <span>→</span>
          <span>{{ explainResult.upstreamModel }}</span>
        </div>

        <el-descriptions :column="1" border>
        <el-descriptions-item :label="t('modelRoutes.clientModel')">
          {{ explainResult.requestedModel }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.provider')">
          {{ explainResult.providerSlug }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('providers.protocol')">
          {{ explainResult.upstreamProtocol }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('modelRoutes.upstreamModel')">
          {{ explainResult.upstreamModel }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('providers.baseUrl')">
          {{ explainResult.baseUrl }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('modelRoutes.endpoint')">
          <code class="inline-code">{{ explainResult.endpoint }}</code>
        </el-descriptions-item>
        <el-descriptions-item :label="t('modelRoutes.availableKeys')">
          {{ explainResult.availableKeys }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('modelRoutes.keyStats')">
          {{ JSON.stringify(explainResult.keyStats) }}
        </el-descriptions-item>
        <el-descriptions-item
          v-if="explainResult.candidates?.length"
          :label="t('modelRoutes.candidates')"
        >
          <div class="candidate-score-list">
            <article
              v-for="candidate in explainResult.candidates"
              :key="`${candidate.providerId}-${candidate.upstreamModel}`"
              class="candidate-score-card"
            >
              <div class="title-row">
                <strong>{{ candidate.providerSlug }} / {{ candidate.upstreamModel }}</strong>
                <el-tag :type="candidate.selected ? 'success' : 'info'">
                  {{ candidate.selected ? t("modelRoutes.selected") : t("modelRoutes.standby") }}
                </el-tag>
              </div>
              <div class="candidate-score-grid">
                <span>score: {{ candidate.score.toFixed(2) }}</span>
                <span>keys: {{ candidate.availableKeys }}</span>
                <span>latency: {{ Math.round(candidate.averageLatencyMs) }} ms</span>
                <span>success: {{ candidate.successRatePercent.toFixed(2) }}%</span>
                <span>requests: {{ candidate.recentRequests }}</span>
                <span>cost: {{ candidate.unitCost.toFixed(4) }}</span>
              </div>
              <p>{{ candidate.reasons.join(" · ") }}</p>
            </article>
          </div>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="testResult?.providerKey"
          :label="t('modelRoutes.providerKey')"
        >
          {{ testResult.providerKey.name }} · {{ testResult.providerKey.id }}
        </el-descriptions-item>
        <el-descriptions-item
          v-if="testResult?.statusCode"
          :label="t('modelRoutes.statusCode')"
        >
          {{ testResult.statusCode }}
        </el-descriptions-item>
        <el-descriptions-item
          v-if="testResult?.usage"
          :label="t('modelRoutes.usage')"
        >
          {{ JSON.stringify(testResult.usage) }}
        </el-descriptions-item>
        <el-descriptions-item
          v-if="testResult?.error"
          :label="t('common.error')"
        >
          <span class="error-text">{{ testResult.error }}</span>
        </el-descriptions-item>
      </el-descriptions>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Delete, Edit, Plus, VideoPlay, View } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { ModelAlias, RouteTarget } from "@gateway/shared";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import {
  type ModelRouteExplain,
  type ModelRouteTestResult,
  useModelAliasesStore,
} from "../stores/model-aliases";
import { useProvidersStore } from "../stores/providers";

const aliases = useModelAliasesStore();
const auth = useAuthStore();
const providers = useProvidersStore();
const { t } = useI18n();
const drawerOpen = ref(false);
const explainOpen = ref(false);
const saving = ref(false);
const testingAlias = ref("");
const explainResult = ref<ModelRouteExplain | null>(null);
const testResult = ref<ModelRouteTestResult | null>(null);

const form = reactive({
  alias: "",
  mode: "balanced" as ModelAlias["mode"],
  targets: [] as RouteTarget[],
});

async function refresh() {
  await Promise.all([aliases.refresh(), providers.refreshAll()]);
}

function resetForm() {
  form.alias = "";
  form.mode = "balanced";
  form.targets = [createTarget()];
}

function openCreate() {
  resetForm();
  drawerOpen.value = true;
}

function openEdit(alias: ModelAlias) {
  form.alias = alias.alias;
  form.mode = alias.mode;
  form.targets = alias.targets.map((target) => ({ ...target }));
  drawerOpen.value = true;
}

async function saveAlias() {
  saving.value = true;
  try {
    await aliases.save({ ...form });
    drawerOpen.value = false;
    ElMessage.success(t("modelRoutes.saved"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function explainAlias(alias: string) {
  try {
    testResult.value = null;
    explainResult.value = await aliases.explain(alias);
    explainOpen.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function testAlias(alias: string) {
  testingAlias.value = alias;
  try {
    const result = await aliases.test(alias);
    testResult.value = result;
    explainResult.value = result.route;
    explainOpen.value = true;
    if (result.ok) {
      ElMessage.success(t("common.success"));
    } else {
      ElMessage.error(result.error ?? t("common.failed"));
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    testingAlias.value = "";
  }
}

async function deleteAlias(alias: string) {
  await ElMessageBox.confirm(
    t("modelRoutes.deleteConfirm"),
    t("common.confirm"),
    { type: "warning" },
  );
  await aliases.delete(alias);
}

function handlePageSizeChange() {
  aliases.filters.page = 1;
  void aliases.refresh();
}

function createTarget(): RouteTarget {
  const provider = providers.allProviders[0];
  return {
    providerId: provider?.id ?? "",
    providerSlug: provider?.slug ?? provider?.provider ?? "",
    upstreamProtocol:
      provider?.protocol === "anthropic" ? "anthropic" : "openai-compatible",
    upstreamModel: "",
    weight: 1,
    priority: 1,
    enabled: true,
  };
}

function addTarget() {
  form.targets.push(createTarget());
}

function removeTarget(index: number) {
  form.targets.splice(index, 1);
}

function providerProtocol(providerId: string) {
  const provider = providers.allProviders.find((item) => item.id === providerId);
  return provider?.protocol ?? "";
}

onMounted(() => {
  void refresh();
  resetForm();
});
</script>
