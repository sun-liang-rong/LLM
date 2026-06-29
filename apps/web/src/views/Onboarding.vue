<template>
  <section class="dashboard onboarding-page">
    <div class="toolbar">
      <div>
        <h2>{{ t("onboarding.title") }}</h2>
        <p>{{ t("onboarding.subtitle") }}</p>
      </div>
      <el-button :loading="refreshing" @click="refreshAll">
        {{ t("common.refresh") }}
      </el-button>
    </div>

    <el-alert
      v-if="profile.error"
      :title="profile.error"
      type="error"
      show-icon
      class="mb"
    />

    <el-alert
      v-if="auth.isPortalUser && !auth.portalUser?.verifiedAt"
      :title="t('profile.unverifiedTitle')"
      :description="t('profile.unverifiedDescription')"
      type="warning"
      show-icon
      class="mb"
    />

    <div class="metric-grid metric-grid-reference">
      <article class="metric metric-reference">
        <span>{{ t("onboarding.progress") }}</span>
        <strong>{{ completedSteps }}/3</strong>
        <small>{{ t("onboarding.progressHint") }}</small>
      </article>
      <article class="metric metric-reference">
        <span>{{ t("onboarding.apiKeys") }}</span>
        <strong>{{ apiKeyCount }}</strong>
        <small>{{ t("onboarding.apiKeysHint") }}</small>
      </article>
      <article class="metric metric-reference">
        <span>{{ t("onboarding.requests") }}</span>
        <strong>{{ requestCount }}</strong>
        <small>{{ t("onboarding.requestsHint") }}</small>
      </article>
    </div>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("onboarding.stepsTitle") }}</h3>
      </div>

      <article class="alert-card onboarding-step-card">
        <div class="title-row">
          <strong>1. {{ t("onboarding.stepCreateTitle") }}</strong>
          <el-tag :type="hasApiKey ? 'success' : 'warning'">
            {{ hasApiKey ? t("onboarding.done") : t("onboarding.pending") }}
          </el-tag>
        </div>
        <p>{{ t("onboarding.stepCreateText") }}</p>
        <div class="actions">
          <el-button
            v-if="!hasApiKey"
            type="primary"
            :loading="creatingKey"
            :disabled="!auth.portalUser?.verifiedAt"
            @click="createFirstKey"
          >
            {{ t("onboarding.createKey") }}
          </el-button>
          <el-button v-else @click="goApiKeys">
            {{ t("nav.apiKeys") }}
          </el-button>
        </div>
      </article>

      <article class="alert-card onboarding-step-card">
        <div class="title-row">
          <strong>2. {{ t("onboarding.stepBaseUrlTitle") }}</strong>
          <el-tag type="success">{{ t("onboarding.ready") }}</el-tag>
        </div>
        <p>{{ t("onboarding.stepBaseUrlText") }}</p>
        <div class="copy-input">
          <el-input :model-value="baseUrl" readonly />
          <el-tooltip :content="t('common.copy')" placement="top">
            <el-button :icon="CopyDocument" @click="copyText(baseUrl)">
              {{ t("common.copy") }}
            </el-button>
          </el-tooltip>
        </div>
      </article>

      <article class="alert-card onboarding-step-card">
        <div class="title-row">
          <strong>3. {{ t("onboarding.stepRequestTitle") }}</strong>
          <el-tag :type="hasFirstRequest ? 'success' : 'warning'">
            {{ hasFirstRequest ? t("onboarding.done") : t("onboarding.pending") }}
          </el-tag>
        </div>
        <p>{{ t("onboarding.stepRequestText") }}</p>
        <pre class="docs-code"><code>{{ requestExample }}</code></pre>
        <div class="actions">
          <el-tooltip :content="t('onboarding.copyExample')" placement="top">
            <el-button :icon="CopyDocument" @click="copyText(requestExample)">
              {{ t("onboarding.copyExample") }}
            </el-button>
          </el-tooltip>
          <el-button
            v-if="hasFirstRequest"
            type="primary"
            @click="finishOnboarding"
          >
            {{ t("onboarding.finish") }}
          </el-button>
        </div>
      </article>
    </section>

    <el-dialog v-model="createdOpen" :title="t('apiKeys.createdTitle')" width="560px">
      <el-alert
        :title="t('apiKeys.createdWarning')"
        type="warning"
        show-icon
        class="mb"
      />
      <div class="copy-input">
        <el-input v-model="createdKey" readonly />
        <el-tooltip :content="t('common.copy')" placement="top">
          <el-button :icon="CopyDocument" @click="copyText(createdKey)">
            {{ t("common.copy") }}
          </el-button>
        </el-tooltip>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { CopyDocument } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { useI18n } from "../i18n";
import { useApiKeysStore } from "../stores/api-keys";
import { useAuthStore } from "../stores/auth";
import { useOverviewStore } from "../stores/overview";
import { useProfileStore } from "../stores/profile";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const apiKeys = useApiKeysStore();
const overview = useOverviewStore();
const profile = useProfileStore();

const creatingKey = ref(false);
const createdKey = ref("");
const createdOpen = ref(false);
const refreshing = ref(false);

const origin = window.location.origin.replace(/:\d+$/, ":3000");
const baseUrl = `${origin}/v1`;

const apiKeyCount = computed(() => profile.data?.apiKeyCount ?? 0);
const requestCount = computed(() => profile.data?.recentUsage.totalRequests ?? 0);
const hasApiKey = computed(() => apiKeyCount.value > 0);
const hasFirstRequest = computed(() => requestCount.value > 0);
const completedSteps = computed(() => {
  let count = 1;
  if (hasApiKey.value) {
    count += 1;
  }
  if (hasFirstRequest.value) {
    count += 1;
  }
  return count;
});
const preferredModel = computed(
  () => overview.data?.aliases?.[0]?.alias ?? "coder-fast",
);
const requestExample = computed(() => {
  const token = createdKey.value || "<your_gateway_key>";
  return [
    `curl ${baseUrl}/chat/completions \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -H 'Authorization: Bearer ${token}' \\`,
    "  -d '{",
    `    \"model\": \"${preferredModel.value}\",`,
    '    "messages": [{"role":"user","content":"hello from AI Gateway"}]',
    "  }'",
  ].join("\n");
});

async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([profile.refresh(), apiKeys.refresh(), overview.refresh()]);
    if (hasFirstRequest.value) {
      auth.completePortalOnboarding();
    }
  } finally {
    refreshing.value = false;
  }
}

async function createFirstKey() {
  creatingKey.value = true;
  try {
    await apiKeys.refreshBillingGroups();
    const created = await apiKeys.create({
      name: "starter-key",
      tenantId: auth.tenantId,
      billingGroupId:
        apiKeys.billingGroups.find((group) => group.isDefault)?.id ??
        apiKeys.billingGroups[0]?.id,
    });
    createdKey.value = created.key;
    createdOpen.value = true;
    ElMessage.success(t("onboarding.keyCreated"));
    await refreshAll();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    creatingKey.value = false;
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
  ElMessage.success(t("common.copied"));
}

function goApiKeys() {
  void router.push("/api-keys");
}

function finishOnboarding() {
  auth.completePortalOnboarding();
  void router.push("/");
}

onMounted(() => {
  void refreshAll();
});
</script>
