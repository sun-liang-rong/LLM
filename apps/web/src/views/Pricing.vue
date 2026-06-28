<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("pricing.title") }}</h2>
        <p>{{ t("pricing.subtitle") }}</p>
      </div>
      <div class="actions">
        <el-button :loading="pricing.loading || providers.loading" @click="refresh">
          {{ t("common.refresh") }}
        </el-button>
        <el-button
          v-if="auth.canOperateRoutes"
          type="primary"
          :icon="Plus"
          @click="openCreateModel"
        >
          {{ t("pricing.addModel") }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="pricing.error || providers.error"
      :title="pricing.error || providers.error"
      type="error"
      show-icon
      class="mb"
    />

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("pricing.modelPrices") }}</h3>
      </div>
      <el-table :data="pricing.modelPrices">
        <el-table-column prop="displayName" :label="t('common.model')" min-width="180" />
        <el-table-column prop="publicId" :label="t('pricing.publicId')" min-width="190" />
        <el-table-column prop="modelGroupName" :label="t('modelsAdmin.group')" min-width="130">
          <template #default="{ row }">{{ row.modelGroupName || "-" }}</template>
        </el-table-column>
        <el-table-column prop="providerName" :label="t('common.provider')" min-width="150" />
        <el-table-column :label="t('pricing.inputPrice')" width="150">
          <template #default="{ row }">${{ money(row.inputUsdPerMillionTokens) }}</template>
        </el-table-column>
        <el-table-column :label="t('pricing.outputPrice')" width="150">
          <template #default="{ row }">${{ money(row.outputUsdPerMillionTokens) }}</template>
        </el-table-column>
        <el-table-column :label="t('pricing.capabilities')" min-width="180">
          <template #default="{ row }">
            <div class="tag-row">
              <el-tag v-if="row.supportsTools" size="small">Tools</el-tag>
              <el-tag v-if="row.supportsVision" size="small">Vision</el-tag>
              <el-tag v-if="row.supportsStreaming" size="small">Stream</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? t("common.enabled") : t("common.disabled") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button :icon="Edit" @click="openEditModel(row)" />
            <el-button
              v-if="auth.canManageBudgets"
              :icon="Delete"
              type="danger"
              @click="deleteModel(row.id)"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer v-model="modelDrawerOpen" :title="t('pricing.modelForm')" size="460px">
      <el-form label-position="top">
        <el-form-item :label="t('common.provider')">
          <el-select v-model="modelForm.providerId" class="full-width">
            <el-option
              v-for="provider in providers.allProviders"
              :key="provider.id"
              :label="`${provider.name} (${provider.slug ?? provider.provider})`"
              :value="provider.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('modelsAdmin.group')">
          <el-select v-model="modelForm.modelGroupId" clearable class="full-width">
            <el-option
              v-for="group in pricing.modelGroups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pricing.publicId')">
          <el-input v-model="modelForm.publicId" placeholder="openai/gpt-4.1-mini" />
        </el-form-item>
        <el-form-item :label="t('modelRoutes.upstreamModel')">
          <el-input v-model="modelForm.upstreamModel" placeholder="gpt-4.1-mini" />
        </el-form-item>
        <el-form-item :label="t('common.name')">
          <el-input v-model="modelForm.displayName" placeholder="GPT-4.1 Mini" />
        </el-form-item>
        <el-form-item :label="t('modelsAdmin.description')">
          <el-input v-model="modelForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('modelsAdmin.contextWindow')">
            <el-input-number v-model="modelForm.contextWindow" :min="0" :step="1000" />
          </el-form-item>
          <el-form-item :label="t('modelsAdmin.priceMultiplier')">
            <el-input-number v-model="modelForm.priceMultiplier" :min="0" :step="0.1" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item :label="t('pricing.inputPrice')">
            <el-input-number v-model="modelForm.inputUsdPerMillionTokens" :min="0" :step="0.1" />
          </el-form-item>
          <el-form-item :label="t('pricing.outputPrice')">
            <el-input-number v-model="modelForm.outputUsdPerMillionTokens" :min="0" :step="0.1" />
          </el-form-item>
        </div>
        <div class="switch-grid">
          <el-checkbox v-model="modelForm.supportsTools">Tools</el-checkbox>
          <el-checkbox v-model="modelForm.supportsVision">Vision</el-checkbox>
          <el-checkbox v-model="modelForm.supportsStreaming">Stream</el-checkbox>
          <el-checkbox v-model="modelForm.enabled">{{ t("common.enabled") }}</el-checkbox>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="modelDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveModel">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("pricing.billingGroups") }}</h3>
        <el-button v-if="auth.canOperateRoutes" :icon="Plus" @click="openCreateBillingGroup">
          {{ t("pricing.addGroup") }}
        </el-button>
      </div>
      <el-table :data="pricing.billingGroups">
        <el-table-column prop="name" :label="t('common.name')" min-width="150" />
        <el-table-column prop="multiplier" :label="t('pricing.multiplier')" width="120">
          <template #default="{ row }">{{ Number(row.multiplier).toFixed(2) }}x</template>
        </el-table-column>
        <el-table-column :label="t('pricing.allowedModels')" min-width="260">
          <template #default="{ row }">
            <span v-if="row.allowedModels.length === 0" class="muted">
              {{ t("pricing.allModels") }}
            </span>
            <div v-else class="tag-row">
              <el-tag
                v-for="model in row.allowedModels.slice(0, 4)"
                :key="model"
                size="small"
                effect="plain"
              >
                {{ model }}
              </el-tag>
              <el-tag v-if="row.allowedModels.length > 4" size="small" type="info">
                +{{ row.allowedModels.length - 4 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="apiKeyCount" label="Keys" width="90" />
        <el-table-column prop="userCount" :label="t('pricing.userCount')" width="100" />
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.isDefault ? 'success' : 'info'">
              {{ row.isDefault ? t("pricing.defaultGroup") : t("pricing.customGroup") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button :icon="Edit" @click="openEditBillingGroup(row)" />
            <el-button
              v-if="auth.canManageBudgets && !row.isDefault"
              :icon="Delete"
              type="danger"
              @click="deleteBillingGroup(row.id)"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer
      v-model="billingGroupDrawerOpen"
      :title="t('pricing.groupForm')"
      size="460px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('common.name')">
          <el-input v-model="billingGroupForm.name" />
        </el-form-item>
        <el-form-item :label="t('pricing.multiplier')">
          <el-input-number v-model="billingGroupForm.multiplier" :min="0.01" :step="0.1" />
        </el-form-item>
        <el-form-item :label="t('pricing.allowedModels')">
          <el-select
            v-model="billingGroupForm.allowedModels"
            multiple
            filterable
            clearable
            class="full-width"
            :placeholder="t('pricing.allModelsPlaceholder')"
          >
            <el-option
              v-for="model in pricing.modelPrices"
              :key="model.publicId"
              :label="model.publicId"
              :value="model.publicId"
            />
          </el-select>
          <p class="muted form-hint">{{ t("pricing.allowedModelsHint") }}</p>
        </el-form-item>
        <el-form-item :label="t('credits.description')">
          <el-input v-model="billingGroupForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-checkbox v-model="billingGroupForm.isDefault">
          {{ t("pricing.defaultGroup") }}
        </el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="billingGroupDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveBillingGroup">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("modelsAdmin.groups") }}</h3>
        <el-button v-if="auth.canOperateRoutes" :icon="Plus" @click="openCreateGroup">
          {{ t("common.create") }}
        </el-button>
      </div>
      <el-table :data="pricing.modelGroups">
        <el-table-column prop="name" :label="t('common.name')" min-width="150" />
        <el-table-column prop="slug" label="Slug" min-width="140" />
        <el-table-column prop="description" :label="t('credits.description')" min-width="220" />
        <el-table-column prop="multiplier" :label="t('modelsAdmin.priceMultiplier')" width="130" />
        <el-table-column prop="modelCount" :label="t('modelsAdmin.modelCount')" width="120" />
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? t("common.enabled") : t("common.disabled") }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button :icon="Edit" @click="openEditGroup(row)" />
            <el-button
              v-if="auth.canManageBudgets"
              :icon="Delete"
              type="danger"
              @click="deleteGroup(row.id)"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer v-model="groupDrawerOpen" :title="t('modelsAdmin.groupForm')" size="420px">
      <el-form label-position="top">
        <el-form-item :label="t('common.name')">
          <el-input v-model="groupForm.name" />
        </el-form-item>
        <el-form-item label="Slug">
          <el-input v-model="groupForm.slug" placeholder="coding" />
        </el-form-item>
        <el-form-item :label="t('credits.description')">
          <el-input v-model="groupForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('modelsAdmin.sortOrder')">
          <el-input-number v-model="groupForm.sortOrder" :step="10" />
        </el-form-item>
        <el-form-item :label="t('modelsAdmin.priceMultiplier')">
          <el-input-number v-model="groupForm.multiplier" :min="0" :step="0.1" />
        </el-form-item>
        <el-checkbox v-model="groupForm.enabled">{{ t("common.enabled") }}</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="groupDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveGroup">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, Edit, Plus } from "@element-plus/icons-vue";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { usePricingStore, type ModelPrice } from "../stores/pricing";
import { useProvidersStore } from "../stores/providers";
import type { BillingGroup, ModelGroup } from "@gateway/shared";

const { t } = useI18n();
const auth = useAuthStore();
const pricing = usePricingStore();
const providers = useProvidersStore();
const saving = ref(false);
const modelDrawerOpen = ref(false);
const groupDrawerOpen = ref(false);
const billingGroupDrawerOpen = ref(false);

const modelForm = reactive({
  id: "",
  providerId: "",
  modelGroupId: "",
  publicId: "",
  upstreamModel: "",
  displayName: "",
  description: "",
  contextWindow: undefined as number | undefined,
  priceMultiplier: 1,
  inputUsdPerMillionTokens: 0,
  outputUsdPerMillionTokens: 0,
  supportsTools: false,
  supportsVision: false,
  supportsStreaming: true,
  enabled: true,
});

const groupForm = reactive({
  id: "",
  name: "",
  slug: "",
  description: "",
  multiplier: 1,
  sortOrder: 0,
  enabled: true,
});

const billingGroupForm = reactive({
  id: "",
  name: "",
  multiplier: 1,
  allowedModels: [] as string[],
  description: "",
  isDefault: false,
});

function money(value: number) {
  return value.toFixed(value >= 1 ? 2 : 4);
}

async function refresh() {
  await Promise.all([pricing.refresh(), providers.refreshAll()]);
}

function openCreateModel() {
  Object.assign(modelForm, {
    id: "",
    providerId: providers.allProviders[0]?.id ?? "",
    modelGroupId: "",
    publicId: "",
    upstreamModel: "",
    displayName: "",
    description: "",
    contextWindow: undefined,
    priceMultiplier: 1,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: true,
    enabled: true,
  });
  modelDrawerOpen.value = true;
}

function openEditModel(row: ModelPrice) {
  Object.assign(modelForm, {
    ...row,
    modelGroupId: row.modelGroupId ?? "",
    description: row.description ?? "",
    contextWindow: row.contextWindow,
    priceMultiplier: row.priceMultiplier ?? 1,
  });
  modelDrawerOpen.value = true;
}

async function saveModel() {
  saving.value = true;
  try {
    await pricing.saveModel({
      ...modelForm,
      id: modelForm.id || undefined,
    });
    ElMessage.success(t("pricing.saved"));
    modelDrawerOpen.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function deleteModel(id: string) {
  await ElMessageBox.confirm(t("pricing.deleteModelConfirm"), t("common.confirm"));
  await pricing.deleteModel(id);
}

function openCreateBillingGroup() {
  Object.assign(billingGroupForm, {
    id: "",
    name: "",
    multiplier: 1,
    allowedModels: [],
    description: "",
    isDefault: false,
  });
  billingGroupDrawerOpen.value = true;
}

function openEditBillingGroup(row: BillingGroup) {
  Object.assign(billingGroupForm, {
    id: row.id,
    name: row.name,
    multiplier: row.multiplier,
    allowedModels: [...row.allowedModels],
    description: row.description ?? "",
    isDefault: row.isDefault,
  });
  billingGroupDrawerOpen.value = true;
}

async function saveBillingGroup() {
  saving.value = true;
  try {
    await pricing.saveBillingGroup({
      ...billingGroupForm,
      id: billingGroupForm.id || undefined,
    });
    ElMessage.success(t("common.success"));
    billingGroupDrawerOpen.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function deleteBillingGroup(id: string) {
  await ElMessageBox.confirm(t("pricing.deleteGroupConfirm"), t("common.confirm"));
  await pricing.deleteBillingGroup(id);
}

function openCreateGroup() {
  Object.assign(groupForm, {
    id: "",
    name: "",
    slug: "",
    description: "",
    multiplier: 1,
    sortOrder: 0,
    enabled: true,
  });
  groupDrawerOpen.value = true;
}

function openEditGroup(row: ModelGroup) {
  Object.assign(groupForm, {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    multiplier: row.multiplier,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  });
  groupDrawerOpen.value = true;
}

async function saveGroup() {
  saving.value = true;
  try {
    await pricing.saveModelGroup({
      ...groupForm,
      id: groupForm.id || undefined,
    });
    ElMessage.success(t("common.success"));
    groupDrawerOpen.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function deleteGroup(id: string) {
  await ElMessageBox.confirm(t("modelsAdmin.deleteGroupConfirm"), t("common.confirm"));
  await pricing.deleteModelGroup(id);
}

onMounted(() => {
  void refresh();
});
</script>
