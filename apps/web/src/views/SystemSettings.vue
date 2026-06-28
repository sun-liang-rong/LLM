<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("systemSettings.title") }}</h2>
        <p>{{ t("systemSettings.subtitle") }}</p>
      </div>
      <el-button type="primary" :loading="site.saving" @click="save">
        {{ t("common.save") }}
      </el-button>
    </div>

    <div class="dashboard-columns">
      <section class="panel">
        <div class="panel-title">
          <h3>{{ t("systemSettings.basic") }}</h3>
        </div>
        <el-form label-position="top" class="settings-form">
          <el-form-item :label="t('systemSettings.siteName')">
            <el-input v-model="form.siteName" />
          </el-form-item>
          <el-form-item :label="t('systemSettings.logoText')">
            <el-input v-model="form.logoText" />
          </el-form-item>
          <el-form-item :label="t('systemSettings.homeNotice')">
            <el-input v-model="form.homeNotice" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item :label="t('systemSettings.defaultModel')">
            <el-input v-model="form.defaultModel" />
          </el-form-item>
        </el-form>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h3>{{ t("systemSettings.access") }}</h3>
        </div>
        <el-form label-position="top" class="settings-form">
          <el-form-item>
            <el-checkbox v-model="form.registrationEnabled">
              {{ t("systemSettings.registrationEnabled") }}
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="form.checkInEnabled">
              {{ t("systemSettings.checkInEnabled") }}
            </el-checkbox>
          </el-form-item>
          <div class="form-grid">
            <el-form-item :label="t('systemSettings.signupBonus')">
              <el-input-number v-model="form.signupBonusUsd" :min="0" :step="1" />
            </el-form-item>
            <el-form-item :label="t('systemSettings.dailyRewardMin')">
              <el-input-number v-model="form.dailyCheckInMinUsd" :min="0" :step="0.01" />
            </el-form-item>
            <el-form-item :label="t('systemSettings.dailyRewardMax')">
              <el-input-number v-model="form.dailyCheckInMaxUsd" :min="0" :step="0.01" />
            </el-form-item>
          </div>
        </el-form>
      </section>
    </div>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("systemSettings.smtp") }}</h3>
      </div>
      <el-form label-position="top" class="settings-form">
        <div class="form-grid">
          <el-form-item :label="t('systemSettings.smtpHost')">
            <el-input v-model="form.smtpHost" />
          </el-form-item>
          <el-form-item :label="t('systemSettings.smtpPort')">
            <el-input-number v-model="form.smtpPort" :min="1" :max="65535" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item :label="t('systemSettings.smtpUser')">
            <el-input v-model="form.smtpUser" />
          </el-form-item>
          <el-form-item :label="t('systemSettings.smtpFrom')">
            <el-input v-model="form.smtpFrom" />
          </el-form-item>
        </div>
      </el-form>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "../i18n";
import { useSiteConfigStore, type SiteSettings } from "../stores/site-config";

const { t } = useI18n();
const site = useSiteConfigStore();
const form = reactive<SiteSettings>({ ...site.settings });

function save() {
  site
    .saveSettings({ ...form })
    .then(() => {
      ElMessage.success(t("common.success"));
    })
    .catch((error) => {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    });
}

onMounted(async () => {
  await site.refreshAdmin();
  Object.assign(form, site.settings);
});
</script>
