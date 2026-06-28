import { createApp } from "vue";
import { createPinia } from "pinia";
import {
  ElAlert,
  ElAside,
  ElButton,
  ElContainer,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElOptionGroup,
  ElPagination,
  ElProgress,
  ElSelect,
  ElSegmented,
  ElSkeleton,
  ElSkeletonItem,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from "element-plus";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/aside/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/container/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/descriptions-item/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/divider/style/css";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/empty/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/header/style/css";
import "element-plus/es/components/icon/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/main/style/css";
import "element-plus/es/components/menu/style/css";
import "element-plus/es/components/menu-item/style/css";
import "element-plus/es/components/option/style/css";
import "element-plus/es/components/option-group/style/css";
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/progress/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/segmented/style/css";
import "element-plus/es/components/skeleton/style/css";
import "element-plus/es/components/skeleton-item/style/css";
import "element-plus/es/components/switch/style/css";
import "element-plus/es/components/table/style/css";
import "element-plus/es/components/table-column/style/css";
import "element-plus/es/components/tag/style/css";
import "element-plus/es/components/tooltip/style/css";
import App from "./App.vue";
import { router } from "./router";
import { useAuthStore } from "./stores/auth";
import "./styles.css";

const app = createApp(App);

const pinia = createPinia();

app.use(pinia);
app.use(router);
app.component("ElAlert", ElAlert);
app.component("ElAside", ElAside);
app.component("ElButton", ElButton);
app.component("ElContainer", ElContainer);
app.component("ElDescriptions", ElDescriptions);
app.component("ElDescriptionsItem", ElDescriptionsItem);
app.component("ElDialog", ElDialog);
app.component("ElDivider", ElDivider);
app.component("ElDrawer", ElDrawer);
app.component("ElEmpty", ElEmpty);
app.component("ElForm", ElForm);
app.component("ElFormItem", ElFormItem);
app.component("ElHeader", ElHeader);
app.component("ElIcon", ElIcon);
app.component("ElInput", ElInput);
app.component("ElInputNumber", ElInputNumber);
app.component("ElMain", ElMain);
app.component("ElMenu", ElMenu);
app.component("ElMenuItem", ElMenuItem);
app.component("ElOption", ElOption);
app.component("ElOptionGroup", ElOptionGroup);
app.component("ElPagination", ElPagination);
app.component("ElProgress", ElProgress);
app.component("ElSelect", ElSelect);
app.component("ElSegmented", ElSegmented);
app.component("ElSkeleton", ElSkeleton);
app.component("ElSkeletonItem", ElSkeletonItem);
app.component("ElSwitch", ElSwitch);
app.component("ElTable", ElTable);
app.component("ElTableColumn", ElTableColumn);
app.component("ElTag", ElTag);
app.component("ElTooltip", ElTooltip);

async function bootstrap() {
  await router.isReady();
  const auth = useAuthStore(pinia);
  if (auth.isAuthenticated && !auth.user) {
    await auth.loadMe().catch(() => undefined);
  }
  if (!auth.isAuthenticated && router.currentRoute.value.meta.requiresAuth) {
    await router.replace({
      path: "/login",
      query:
        router.currentRoute.value.fullPath === "/console"
          ? undefined
          : { redirect: router.currentRoute.value.fullPath },
    });
  }
  app.mount("#app");
}

void bootstrap();
