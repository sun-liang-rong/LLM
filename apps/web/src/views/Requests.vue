<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("requests.title") }}</h2>
        <p>{{ t("requests.subtitle") }}</p>
      </div>
      <el-button :loading="store.loading" type="primary" @click="store.refresh">
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

    <section class="panel">
      <div class="filter-row">
        <el-select
          v-model="store.filters.status"
          clearable
          :placeholder="t('common.status')"
          class="filter-control"
          @change="store.refreshFromFirstPage"
        >
          <el-option label="completed" value="completed" />
          <el-option label="failed" value="failed" />
          <el-option label="started" value="started" />
        </el-select>
        <el-select
          v-if="!auth.isPortalUser"
          v-model="store.filters.provider"
          clearable
          :placeholder="t('common.provider')"
          class="filter-control"
          @change="store.refreshFromFirstPage"
        >
          <el-option
            v-for="provider in providers.allProviders"
            :key="provider.id"
            :label="provider.slug ?? provider.provider"
            :value="provider.slug ?? provider.provider"
          />
        </el-select>
        <el-input
          v-model="store.filters.model"
          clearable
          :placeholder="t('common.model')"
          class="filter-control"
          @keyup.enter="store.refreshFromFirstPage"
          @clear="store.refreshFromFirstPage"
        />
      </div>

      <el-table :data="store.rows" :empty-text="t('requests.noRequests')">
        <el-table-column prop="createdAt" :label="t('requests.time')" min-width="190">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="protocol" :label="t('common.protocol')" width="110" />
        <el-table-column prop="provider" :label="t('common.provider')" width="110" />
        <el-table-column prop="model" :label="t('common.model')" min-width="150" />
        <el-table-column prop="upstreamModel" :label="t('requests.upstream')" min-width="150" />
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('requests.tokens')" width="150">
          <template #default="{ row }">
            <div class="token-cell">
              <strong>{{ tokenTotal(row) }}</strong>
              <span>{{ row.inputTokens }} / {{ row.outputTokens }}</span>
              <span v-if="tokenDetails(row)" class="muted">
                {{ tokenDetails(row) }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('requests.cost')" width="120">
          <template #default="{ row }">
            ${{ Number(row.costUsd ?? 0).toFixed(6) }}
          </template>
        </el-table-column>
        <el-table-column prop="latencyMs" :label="t('common.latency')" width="110" />
        <el-table-column prop="retryCount" :label="t('requests.retry')" width="90" />
        <el-table-column prop="requestId" :label="t('requests.requestId')" min-width="240" />
        <el-table-column :label="t('requests.detail')" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.requestId)">
              {{ t("requests.detail") }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.error')" min-width="240">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.error"
              :content="row.error"
              placement="top"
            >
              <span class="truncate-text error-text">{{ row.error }}</span>
            </el-tooltip>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="store.filters.page"
          v-model:page-size="store.filters.pageSize"
          :total="store.total"
          :page-sizes="[10, 20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next"
          @current-change="store.refresh"
          @size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="detailOpen"
      :title="t('requests.detailTitle')"
      width="760px"
      @closed="detailStore.clear"
    >
      <el-alert
        v-if="detailStore.error"
        :title="detailStore.error"
        type="error"
        show-icon
        class="mb"
      />
      <el-skeleton v-else-if="detailStore.loading" :rows="6" animated />
      <el-descriptions v-else-if="detailStore.detail" :column="1" border>
        <el-descriptions-item :label="t('requests.requestId')">
          {{ detailStore.detail.requestId }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.protocol')">
          {{ detailStore.detail.protocol }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.provider')">
          {{ detailStore.detail.provider || "-" }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.model')">
          {{ detailStore.detail.model }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('requests.upstream')">
          {{ detailStore.detail.upstreamModel || "-" }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('requests.tokens')">
          {{ detailStore.detail.totalTokens }} ({{ detailStore.detail.inputTokens }} / {{ detailStore.detail.outputTokens }})
        </el-descriptions-item>
        <el-descriptions-item :label="t('requests.cost')">
          ${{ Number(detailStore.detail.costUsd ?? 0).toFixed(6) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.latency')">
          {{ detailStore.detail.latencyMs ?? "-" }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('requests.retry')">
          {{ detailStore.detail.retryCount }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.error')">
          {{ detailStore.detail.error || "-" }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useRequestDetailStore } from "../stores/request-detail";
import { useRequestsStore } from "../stores/requests";
import type { RequestRow } from "../stores/requests";
import { useProvidersStore } from "../stores/providers";

const store = useRequestsStore();
const providers = useProvidersStore();
const auth = useAuthStore();
const detailStore = useRequestDetailStore();
const { t } = useI18n();
const detailOpen = ref(false);

function statusType(status: string) {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

function tokenTotal(row: RequestRow) {
  return row.totalTokens || row.inputTokens + row.outputTokens;
}

function tokenDetails(row: RequestRow) {
  const parts: string[] = [];
  if (row.cacheReadTokens) parts.push(`cache read ${row.cacheReadTokens}`);
  if (row.cacheCreationTokens) {
    parts.push(`cache write ${row.cacheCreationTokens}`);
  }
  if (row.reasoningTokens) parts.push(`reasoning ${row.reasoningTokens}`);
  if (row.estimatedTokens) parts.push("estimated");
  return parts.join(" · ");
}

function handlePageSizeChange() {
  store.filters.page = 1;
  void store.refresh();
}

async function openDetail(requestId: string) {
  detailOpen.value = true;
  await detailStore.open(requestId);
}

onMounted(() => {
  void store.refresh();
  if (!auth.isPortalUser) {
    void providers.refreshAll();
  }
});
</script>
