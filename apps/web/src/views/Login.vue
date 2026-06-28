<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand login-brand">
        <div class="brand-mark">AG</div>
        <div>
          <strong>AI Gateway</strong>
          <span>
            {{
              loginMode === "reset"
                ? t("login.resetMode")
                : t("login.portalTitle")
            }}
          </span>
        </div>
      </div>

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item v-if="loginMode !== 'reset'">
          <el-segmented
            v-model="loginMode"
            :options="modeOptions"
            class="full-width"
          />
        </el-form-item>
        <el-form-item v-if="loginMode === 'register'" :label="t('tenancy.userName')">
          <el-input v-model="name" autocomplete="name" />
        </el-form-item>
        <el-form-item :label="t('login.email')">
          <el-input v-model="email" autocomplete="username" />
        </el-form-item>
        <el-form-item v-if="requiresVerificationCode" :label="t('login.verificationCode')">
          <div class="copy-input">
            <el-input
              v-model="verificationCode"
              :maxlength="auth.verificationSettings?.codeLength ?? 6"
            />
            <el-button
              :disabled="!email || countdown > 0 || sendingCode"
              :loading="sendingCode"
              @click="sendCode"
            >
              {{
                countdown > 0
                  ? `${countdown}s`
                  : t("login.sendVerificationCode")
              }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('login.password')">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="current-password"
            @keyup.enter="submit"
          />
          <div v-if="loginMode === 'login'" class="login-help-row">
            <el-button link type="primary" @click="enterResetMode">
              {{ t("login.forgotPassword") }}
            </el-button>
          </div>
        </el-form-item>
        <el-alert
          v-if="auth.error"
          :title="auth.error"
          type="error"
          show-icon
          class="mb"
        />
        <el-button
          type="primary"
          class="login-button"
          :loading="auth.loading"
          @click="submit"
        >
          {{
            loginMode === "register"
              ? t("login.signUp")
              : loginMode === "reset"
                ? t("login.resetPassword")
                : t("login.signIn")
          }}
        </el-button>
        <el-button
          v-if="loginMode === 'reset'"
          class="login-secondary-button"
          @click="loginMode = 'login'"
        >
          {{ t("login.backToLogin") }}
        </el-button>
        <el-select
          v-model="locale"
          class="login-language"
          @change="setLocale"
        >
          <el-option label="中文" value="zh-CN" />
          <el-option label="English" value="en-US" />
        </el-select>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { locale, setLocale, t } = useI18n();
const email = ref("");
const password = ref("");
const name = ref("");
const verificationCode = ref("");
const loginMode = ref<"login" | "register" | "reset">("login");
const sendingCode = ref(false);
const countdown = ref(0);
const verificationToken = ref("");
let timer: number | undefined;

const modeOptions = computed(() => [
  { label: t("login.signIn"), value: "login" },
  { label: t("login.registerMode"), value: "register" },
]);

const requiresVerificationCode = computed(
  () =>
    (loginMode.value === "register" || loginMode.value === "reset") &&
    auth.verificationSettings?.enabled,
);

async function submit() {
  if (loginMode.value === "register") {
    await auth.register({
      email: email.value,
      password: password.value,
      name: name.value,
      verificationCode: verificationCode.value,
      verificationToken: verificationToken.value,
    });
  } else if (loginMode.value === "reset") {
    await auth.resetPassword({
      email: email.value,
      password: password.value,
      verificationCode: verificationCode.value,
    });
    ElMessage.success(t("login.resetSuccess"));
    loginMode.value = "login";
    password.value = "";
    verificationCode.value = "";
    return;
  } else {
    await auth.loginUnified(email.value, password.value);
  }
  const redirect =
    typeof route.query.redirect === "string" ? route.query.redirect : "/console";
  await router.push(redirect);
}

function enterResetMode() {
  auth.error = "";
  verificationCode.value = "";
  loginMode.value = "reset";
}

async function sendCode() {
  sendingCode.value = true;
  try {
    const result =
      loginMode.value === "reset"
        ? await auth.sendPasswordResetCode(email.value)
        : await auth.sendRegistrationCode(email.value);
    const cooldown =
      result.resendCooldownSeconds ??
      auth.verificationSettings?.resendCooldownSeconds ??
      60;
    countdown.value = cooldown;
    if (timer) {
      window.clearInterval(timer);
    }
    timer = window.setInterval(() => {
      if (countdown.value <= 1) {
        countdown.value = 0;
        if (timer) {
          window.clearInterval(timer);
          timer = undefined;
        }
        return;
      }
      countdown.value -= 1;
    }, 1000);
    ElMessage.success(
      result.devCode
        ? `${t("login.codeSent")} (${result.devCode})`
        : loginMode.value === "reset"
          ? t("login.resetCodeSent")
          : t("login.codeSent"),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    sendingCode.value = false;
  }
}

onMounted(() => {
  if (route.query.mode === "register") {
    loginMode.value = "register";
  } else if (route.query.mode === "reset") {
    loginMode.value = "reset";
  }
  if (typeof route.query.token === "string") {
    verificationToken.value = route.query.token;
  }
  void auth.loadVerificationSettings().catch(() => undefined);
});
</script>
