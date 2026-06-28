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

    <section class="market-head">
      <div>
        <el-tag effect="plain">{{ t("public.models") }}</el-tag>
        <h1>{{ t("market.title") }}</h1>
        <p>{{ t("market.subtitle") }}</p>
      </div>
      <el-input
        v-model="keyword"
        clearable
        :placeholder="t('market.search')"
        class="market-search"
      />
    </section>

    <section class="market-tabs">
      <el-radio-group v-model="activeGroup">
        <el-radio-button label="">
          {{ t("market.allGroups") }}
        </el-radio-button>
        <el-radio-button
          v-for="group in models.groups"
          :key="group.id"
          :label="group.id"
        >
          {{ group.name }}
        </el-radio-button>
      </el-radio-group>
    </section>

    <el-alert
      v-if="models.error"
      :title="models.error"
      type="error"
      show-icon
      class="mb"
    />

    <section class="model-market-grid" v-loading="models.loading">
      <article v-for="model in filteredModels" :key="model.id" class="model-card">
        <div class="model-card-head">
          <div>
            <span>{{ model.providerName ?? model.provider }}</span>
            <h2>{{ model.displayName }}</h2>
          </div>
          <el-tag :type="model.providerEnabled === false ? 'info' : 'success'">
            {{ model.protocol }}
          </el-tag>
        </div>
        <p>{{ model.description || model.publicId || model.id }}</p>
        <div class="model-meta-row">
          <el-tag v-if="model.modelGroupName" size="small" effect="plain">
            {{ model.modelGroupName }}
          </el-tag>
          <el-tag v-if="model.contextWindow" size="small" effect="plain">
            {{ compact(model.contextWindow) }} ctx
          </el-tag>
          <el-tag v-if="model.priceMultiplier" size="small" effect="plain">
            {{ model.priceMultiplier }}x
          </el-tag>
        </div>
        <div class="model-price-row">
          <div>
            <span>{{ t("pricing.inputPrice") }}</span>
            <strong>${{ price(model.inputUsdPerMillionTokens) }}</strong>
          </div>
          <div>
            <span>{{ t("pricing.outputPrice") }}</span>
            <strong>${{ price(model.outputUsdPerMillionTokens) }}</strong>
          </div>
        </div>
        <div class="model-tags">
          <el-tag v-if="model.supportsTools" size="small">Tools</el-tag>
          <el-tag v-if="model.supportsVision" size="small">Vision</el-tag>
          <el-tag v-if="model.supportsStreaming" size="small">Stream</el-tag>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "../i18n";
import { usePublicModelsStore } from "../stores/public-models";

const { t } = useI18n();
const models = usePublicModelsStore();
const keyword = ref("");
const activeGroup = ref("");

const filteredModels = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  return models.rows.filter((model) => {
    if (activeGroup.value && model.modelGroupId !== activeGroup.value) {
      return false;
    }
    if (!value) {
      return true;
    }
    return [
      model.displayName,
      model.publicId,
      model.provider,
      model.providerName,
      model.upstreamModel,
      model.modelGroupName,
      model.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(value);
  });
});

function price(value: number) {
  return value.toFixed(value >= 1 ? 2 : 4);
}

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

onMounted(() => {
  void models.refresh();
});
</script>
