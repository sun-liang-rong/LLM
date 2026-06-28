<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("announcements.title") }}</h2>
        <p>{{ t("announcements.subtitle") }}</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("announcements.list") }}</h3>
        <span class="panel-meta">{{ rows.length }}</span>
      </div>
      <div v-if="rows.length > 0" v-loading="site.loading" class="announcement-list">
        <article v-for="item in rows" :key="item.id" class="announcement-item">
          <div class="announcement-head">
            <div>
              <h3>{{ item.title }}</h3>
              <span>{{ new Date(item.publishAt).toLocaleString() }}</span>
            </div>
            <div class="tag-row">
              <el-tag v-if="item.pinned" type="warning" size="small">
                {{ t("announcements.pinned") }}
              </el-tag>
              <el-tag size="small">{{ typeLabel(item.type) }}</el-tag>
            </div>
          </div>
          <p>{{ item.content }}</p>
        </article>
      </div>
      <el-empty
        v-else
        class="dashboard-empty"
        :description="t('announcements.empty')"
      />
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "../i18n";
import { useSiteConfigStore, type Announcement } from "../stores/site-config";

const { t } = useI18n();
const site = useSiteConfigStore();
const rows = computed(() => site.publishedAnnouncements);

function typeLabel(type: Announcement["type"]) {
  const mapping: Record<Announcement["type"], string> = {
    notice: t("announcements.type.notice"),
    model: t("announcements.type.model"),
    maintenance: t("announcements.type.maintenance"),
    activity: t("announcements.type.activity"),
  };
  return mapping[type];
}

onMounted(() => {
  void site.refreshPublic();
});
</script>
