<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("announcementAdmin.title") }}</h2>
        <p>{{ t("announcementAdmin.subtitle") }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">
        {{ t("announcementAdmin.add") }}
      </el-button>
    </div>

    <section class="panel">
      <el-table v-loading="site.loading" :data="site.announcements">
        <el-table-column prop="title" :label="t('announcementAdmin.titleField')" min-width="220" />
        <el-table-column :label="t('announcementAdmin.type')" width="140">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column :label="t('announcementAdmin.status')" width="130">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('announcementAdmin.pinned')" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.pinned" type="warning">{{ t("common.enabled") }}</el-tag>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="publishAt" :label="t('announcementAdmin.publishAt')" min-width="190">
          <template #default="{ row }">
            {{ new Date(row.publishAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-tooltip :content="t('common.edit')" placement="top">
                <el-button
                  :icon="Edit"
                  :aria-label="t('common.edit')"
                  @click="openEdit(row)"
                />
              </el-tooltip>
              <el-tooltip :content="t('common.delete')" placement="top">
                <el-button
                  :icon="Delete"
                  type="danger"
                  :aria-label="t('common.delete')"
                  @click="deleteItem(row.id)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer v-model="drawerOpen" :title="t('announcementAdmin.formTitle')" size="520px">
      <el-form label-position="top">
        <el-form-item :label="t('announcementAdmin.titleField')">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item :label="t('announcementAdmin.content')">
          <el-input v-model="form.content" type="textarea" :rows="6" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('announcementAdmin.type')">
            <el-select v-model="form.type" class="full-width">
              <el-option :label="t('announcements.type.notice')" value="notice" />
              <el-option :label="t('announcements.type.model')" value="model" />
              <el-option :label="t('announcements.type.maintenance')" value="maintenance" />
              <el-option :label="t('announcements.type.activity')" value="activity" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('announcementAdmin.status')">
            <el-select v-model="form.status" class="full-width">
              <el-option :label="t('announcementAdmin.published')" value="published" />
              <el-option :label="t('announcementAdmin.draft')" value="draft" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('announcementAdmin.publishAt')">
          <el-date-picker
            v-model="form.publishAt"
            type="datetime"
            class="full-width"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          />
        </el-form-item>
        <el-checkbox v-model="form.pinned">
          {{ t("announcementAdmin.pinned") }}
        </el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="drawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="site.saving" @click="save">{{ t("common.save") }}</el-button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Delete, Edit, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "../i18n";
import { useSiteConfigStore, type Announcement } from "../stores/site-config";

const { t } = useI18n();
const site = useSiteConfigStore();
const drawerOpen = ref(false);
const form = reactive<Partial<Announcement>>({
  id: "",
  title: "",
  content: "",
  type: "notice",
  status: "draft",
  pinned: false,
  publishAt: new Date().toISOString(),
});

function openCreate() {
  Object.assign(form, {
    id: "",
    title: "",
    content: "",
    type: "notice",
    status: "draft",
    pinned: false,
    publishAt: new Date().toISOString(),
  });
  drawerOpen.value = true;
}

function openEdit(row: Announcement) {
  Object.assign(form, row);
  drawerOpen.value = true;
}

async function save() {
  try {
    await site.saveAnnouncement({
      ...form,
      id: form.id || undefined,
      title: form.title?.trim(),
      content: form.content?.trim(),
    });
    drawerOpen.value = false;
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function deleteItem(id: string) {
  await ElMessageBox.confirm(
    t("announcementAdmin.deleteConfirm"),
    t("common.confirm"),
    { type: "warning" },
  );
  await site.deleteAnnouncement(id);
}

function typeLabel(type: Announcement["type"]) {
  const mapping: Record<Announcement["type"], string> = {
    notice: t("announcements.type.notice"),
    model: t("announcements.type.model"),
    maintenance: t("announcements.type.maintenance"),
    activity: t("announcements.type.activity"),
  };
  return mapping[type];
}

function statusLabel(status: Announcement["status"]) {
  return status === "published"
    ? t("announcementAdmin.published")
    : t("announcementAdmin.draft");
}

onMounted(() => {
  void site.refreshAdmin();
});
</script>
