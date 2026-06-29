<template>
  <main class="public-page">
    <header class="public-nav">
      <RouterLink class="public-brand" to="/">
        <span class="public-brand-mark">AG</span>
        <strong>AI Gateway</strong>
      </RouterLink>
      <nav>
        <RouterLink to="/">{{ t("public.home") }}</RouterLink>
        <RouterLink to="/models">{{ t("public.models") }}</RouterLink>
        <RouterLink to="/console">{{ t("public.console") }}</RouterLink>
      </nav>
      <div class="public-actions">
        <RouterLink class="public-link-button" to="/login">
          {{ t("login.signIn") }}
        </RouterLink>
        <RouterLink class="public-primary-button" to="/login?mode=register">
          {{ t("login.signUp") }}
        </RouterLink>
      </div>
    </header>

    <section class="public-hero">
      <div class="public-hero-copy">
        <el-tag size="large" effect="plain">{{ t("public.heroBadge") }}</el-tag>
        <h1>{{ t("public.heroTitle") }}</h1>
        <p>{{ t("public.heroSubtitle") }}</p>
        <div class="public-hero-actions">
          <RouterLink class="public-primary-button" to="/login?mode=register">
            {{ t("public.startNow") }}
          </RouterLink>
          <RouterLink class="public-link-button" to="/models">
            {{ t("public.viewModels") }}
          </RouterLink>
        </div>
      </div>
      <div class="public-terminal">
        <div class="terminal-dots"><span /><span /><span /></div>
        <pre><code>curl /v1/chat/completions
model: coder-fast
price: model x group_multiplier
balance: charged after usage</code></pre>
      </div>
    </section>

    <section class="public-metrics">
      <article>
        <span>{{ t("public.metricModels") }}</span>
        <strong>{{ modelCount }}</strong>
      </article>
      <article>
        <span>{{ t("public.metricProviders") }}</span>
        <strong>{{ providerCount }}</strong>
      </article>
      <article>
        <span>{{ t("public.metricBilling") }}</span>
        <strong>{{ t("public.multiplierReady") }}</strong>
      </article>
    </section>

    <section class="public-section">
      <div class="public-section-title">
        <h2>{{ t("public.whyTitle") }}</h2>
        <RouterLink to="/models">{{ t("public.allModels") }}</RouterLink>
      </div>
      <div class="public-feature-grid">
        <article>
          <el-icon><Connection /></el-icon>
          <h3>{{ t("public.featureGateway") }}</h3>
          <p>{{ t("public.featureGatewayText") }}</p>
        </article>
        <article>
          <el-icon><Money /></el-icon>
          <h3>{{ t("public.featurePricing") }}</h3>
          <p>{{ t("public.featurePricingText") }}</p>
        </article>
        <article>
          <el-icon><Wallet /></el-icon>
          <h3>{{ t("public.featureBalance") }}</h3>
          <p>{{ t("public.featureBalanceText") }}</p>
        </article>
      </div>
    </section>

    <section class="public-section">
      <div class="public-section-title">
        <h2>{{ t("public.models") }}</h2>
        <RouterLink to="/models">{{ t("public.allModels") }}</RouterLink>
      </div>
      <PublicModelMarket :limit="6" :show-header="false" :show-filters="false" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { Connection, Money, Wallet } from "@element-plus/icons-vue";
import { useI18n } from "../i18n";
import { usePublicModelsStore } from "../stores/public-models";
import PublicModelMarket from "../components/PublicModelMarket.vue";

const { t } = useI18n();
const models = usePublicModelsStore();

const modelCount = computed(() => models.rows.length || "-");
const providerCount = computed(() => {
  const providers = new Set(models.rows.map((model) => model.provider));
  return providers.size || "-";
});

onMounted(() => {
  void models.refresh();
});
</script>
