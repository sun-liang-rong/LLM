<template>
  <main class="not-found-page">
    <section class="not-found-card">
      <span class="not-found-code">404</span>
      <h1>{{ t("notFound.title") }}</h1>
      <p>{{ t("notFound.description") }}</p>
      <el-button type="primary" @click="goHome">
        {{ t("notFound.backHome") }}
      </el-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useI18n } from "../i18n";

const router = useRouter();
const { t } = useI18n();

function goHome() {
  void router.push("/");
}
</script>
