<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("profile.title") }}</h2>
        <p>{{ t("profile.subtitle") }}</p>
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

    <template v-if="store.data">
      <div class="metric-grid metric-grid-reference">
        <article class="metric metric-reference">
          <span>{{ t("profile.balance") }}</span>
          <strong>{{ balanceText }}</strong>
          <small>{{ t("profile.balanceHint") }}</small>
        </article>
      </div>

      <section class="panel">
        <div class="panel-title">
          <h3>{{ t("profile.accountInfo") }}</h3>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('tenancy.userEmail')">
            {{ store.data.user.email }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('tenancy.userName')">
            {{ store.data.user.name || "-" }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('tenancy.userRole')">
            {{ store.data.user.role }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('profile.emailStatus')">
            <el-tag :type="store.data.user.verifiedAt ? 'success' : 'warning'">
              {{
                store.data.user.verifiedAt
                  ? t("profile.verified")
                  : t("profile.unverified")
              }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useCreditsStore } from "../stores/credits";
import { useProfileStore } from "../stores/profile";
import { formatUsd } from "../utils/money";

const { t } = useI18n();
const auth = useAuthStore();
const store = useProfileStore();
const credits = useCreditsStore();

const balanceText = computed(() => formatUsd(credits.summary?.balanceUsd));

async function refresh() {
  await store.refresh();
  if (auth.isPortalUser) {
    await credits.refreshSummary().catch(() => undefined);
  }
}

onMounted(() => {
  void refresh();
});
</script>
