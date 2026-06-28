<template>
  <section class="dashboard">
    <el-empty
      v-if="auth.isPortalUser"
      :description="t('tenancy.subtitle')"
      class="dashboard-empty"
    />
    <template v-else>
    <div class="toolbar">
      <div>
        <h2>{{ t("tenancy.title") }}</h2>
        <p>{{ t("tenancy.subtitle") }}</p>
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

    <div class="dashboard-columns">
      <div class="dashboard-column">
        <section class="panel">
          <div class="panel-title">
            <h3>{{ t("tenancy.tenants") }}</h3>
            <el-button
              v-if="auth.canManageTenancy"
              type="primary"
              :icon="Plus"
              @click="tenantDrawerOpen = true"
            >
              {{ t("tenancy.addTenant") }}
            </el-button>
          </div>
          <el-table :data="store.tenants">
            <el-table-column prop="name" :label="t('tenancy.tenantName')" min-width="160" />
            <el-table-column prop="projectCount" :label="t('tenancy.projectCount')" width="100" />
            <el-table-column prop="userCount" :label="t('tenancy.userCount')" width="100" />
            <el-table-column prop="apiKeyCount" :label="t('tenancy.apiKeyCount')" width="100" />
          </el-table>
        </section>

        <section class="panel">
          <div class="panel-title">
            <h3>{{ t("tenancy.projects") }}</h3>
            <el-button
              v-if="auth.canManageBudgets"
              type="primary"
              :icon="Plus"
              @click="projectDrawerOpen = true"
            >
              {{ t("tenancy.addProject") }}
            </el-button>
          </div>
          <el-table :data="store.projects">
            <el-table-column prop="name" :label="t('tenancy.projectName')" min-width="160" />
            <el-table-column prop="tenantId" :label="t('budgets.scopeTenant')" min-width="140" />
            <el-table-column prop="apiKeyCount" :label="t('tenancy.apiKeyCount')" width="100" />
          </el-table>
        </section>
      </div>

      <div class="dashboard-column">
        <section class="panel">
          <div class="panel-title">
            <h3>{{ t("tenancy.users") }}</h3>
            <el-button
              v-if="auth.canManageTenancy"
              type="primary"
              :icon="Plus"
              @click="userDrawerOpen = true"
            >
              {{ t("tenancy.addUser") }}
            </el-button>
          </div>
          <el-table :data="store.users">
            <el-table-column prop="email" :label="t('tenancy.userEmail')" min-width="200" />
            <el-table-column prop="name" :label="t('tenancy.userName')" min-width="140" />
            <el-table-column prop="tenantId" :label="t('budgets.scopeTenant')" min-width="140" />
            <el-table-column prop="role" :label="t('tenancy.userRole')" width="120" />
          </el-table>
        </section>
      </div>
    </div>

    <el-drawer
      v-if="auth.canManageTenancy"
      v-model="tenantDrawerOpen"
      :title="t('tenancy.addTenant')"
      size="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('tenancy.tenantName')">
          <el-input v-model="tenantForm.name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tenantDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="savingTenant" @click="saveTenant">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <el-drawer
      v-if="auth.canManageBudgets"
      v-model="projectDrawerOpen"
      :title="t('tenancy.addProject')"
      size="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('budgets.scopeTenant')">
          <el-select v-model="projectForm.tenantId" class="full-width">
            <el-option
              v-for="tenant in store.tenants"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenancy.projectName')">
          <el-input v-model="projectForm.name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="savingProject" @click="saveProject">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>

    <el-drawer
      v-if="auth.canManageTenancy"
      v-model="userDrawerOpen"
      :title="t('tenancy.addUser')"
      size="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('budgets.scopeTenant')">
          <el-select v-model="userForm.tenantId" class="full-width">
            <el-option
              v-for="tenant in store.tenants"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenancy.userEmail')">
          <el-input v-model="userForm.email" />
        </el-form-item>
        <el-form-item :label="t('tenancy.userName')">
          <el-input v-model="userForm.name" />
        </el-form-item>
        <el-form-item :label="t('tenancy.userRole')">
          <el-select v-model="userForm.role" class="full-width">
            <el-option :label="t('tenancy.owner')" value="owner" />
            <el-option :label="t('tenancy.admin')" value="admin" />
            <el-option :label="t('tenancy.operator')" value="operator" />
            <el-option :label="t('tenancy.viewer')" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDrawerOpen = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="savingUser" @click="saveUser">
          {{ t("common.save") }}
        </el-button>
      </template>
    </el-drawer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useTenancyStore } from "../stores/tenancy";

const { t } = useI18n();
const auth = useAuthStore();
const store = useTenancyStore();
const tenantDrawerOpen = ref(false);
const projectDrawerOpen = ref(false);
const userDrawerOpen = ref(false);
const savingTenant = ref(false);
const savingProject = ref(false);
const savingUser = ref(false);

const tenantForm = reactive({ name: "" });
const projectForm = reactive({ tenantId: "default", name: "" });
const userForm = reactive({
  tenantId: "default",
  email: "",
  name: "",
  role: "viewer",
});

async function refresh() {
  await store.refresh(store.selectedTenantId || "default");
}

async function saveTenant() {
  savingTenant.value = true;
  try {
    await store.saveTenant({ name: tenantForm.name });
    tenantDrawerOpen.value = false;
    tenantForm.name = "";
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    savingTenant.value = false;
  }
}

async function saveProject() {
  savingProject.value = true;
  try {
    await store.saveProject({
      tenantId: projectForm.tenantId,
      name: projectForm.name,
    });
    projectDrawerOpen.value = false;
    projectForm.name = "";
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    savingProject.value = false;
  }
}

async function saveUser() {
  savingUser.value = true;
  try {
    await store.saveUser({
      tenantId: userForm.tenantId,
      email: userForm.email,
      name: userForm.name,
      role: userForm.role,
    });
    userDrawerOpen.value = false;
    userForm.email = "";
    userForm.name = "";
    userForm.role = "viewer";
    ElMessage.success(t("common.success"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    savingUser.value = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>
