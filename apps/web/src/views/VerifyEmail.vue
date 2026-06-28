<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand login-brand">
        <div class="brand-mark">AG</div>
        <div>
          <strong>AI Gateway</strong>
          <span>{{ t("profile.verifyEmailTitle") }}</span>
        </div>
      </div>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        class="mb"
      />
      <el-alert
        v-else-if="success"
        :title="t('profile.verifyEmailSuccess')"
        type="success"
        show-icon
        class="mb"
      />
      <el-skeleton v-else animated :rows="3" />

      <el-button class="login-button" type="primary" @click="goLogin">
        {{ t("login.signIn") }}
      </el-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiFetch, responseErrorMessage } from "../api/client";
import { useI18n } from "../i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const error = ref("");
const success = ref(false);

async function verify() {
  const token =
    typeof route.query.token === "string" ? route.query.token : "";
  if (!token) {
    error.value = t("profile.verifyEmailMissing");
    return;
  }

  const response = await apiFetch(
    `/auth/verify-email?token=${encodeURIComponent(token)}`,
  );
  if (!response.ok) {
    error.value = await responseErrorMessage(response, t("common.failed"));
    return;
  }
  success.value = true;
}

function goLogin() {
  void router.push({
    path: "/login",
    query:
      typeof route.query.token === "string"
        ? { token: route.query.token, mode: "register" }
        : undefined,
  });
}

onMounted(() => {
  void verify();
});
</script>
