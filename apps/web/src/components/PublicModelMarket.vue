<template>
  <section class="public-model-market">
    <div v-if="showHeader" class="market-head">
      <div>
        <el-tag effect="plain">{{ t("public.models") }}</el-tag>
        <h1>{{ title ?? t("market.title") }}</h1>
        <p>{{ subtitle ?? t("market.subtitle") }}</p>
      </div>
      <el-input
        v-if="showFilters"
        v-model="keyword"
        clearable
        :placeholder="t('market.search')"
        class="market-search"
      />
    </div>

    <section v-if="showFilters" class="market-tabs">
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
      <article v-for="model in visibleModels" :key="model.id" class="model-card">
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "../i18n";
import { usePublicModelsStore } from "../stores/public-models";

const props = withDefaults(
  defineProps<{
    limit?: number;
    showHeader?: boolean;
    showFilters?: boolean;
    title?: string;
    subtitle?: string;
  }>(),
  {
    limit: undefined,
    showHeader: true,
    showFilters: true,
    title: undefined,
    subtitle: undefined,
  },
);

const { t } = useI18n();
const models = usePublicModelsStore();
const keyword = ref("");
const activeGroup = ref("");

const filteredModels = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  return models.rows.filter((model) => {
    if (props.showFilters && activeGroup.value && model.modelGroupId !== activeGroup.value) {
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

const visibleModels = computed(() =>
  props.limit ? filteredModels.value.slice(0, props.limit) : filteredModels.value,
);

function price(value: number) {
  return value.toFixed(value >= 1 ? 2 : 4);
}

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

onMounted(() => {
  if (models.rows.length === 0 && !models.loading) {
    void models.refresh();
  }
});
</script>
