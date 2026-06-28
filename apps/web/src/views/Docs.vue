<template>
  <section class="dashboard">
    <div class="toolbar">
      <div>
        <h2>{{ t("docs.title") }}</h2>
        <p>{{ t("docs.subtitle") }}</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("docs.openaiTitle") }}</h3>
      </div>
      <pre class="docs-code"><code>OPENAI_BASE_URL={{ baseUrl }}
OPENAI_API_KEY=&lt;your_gateway_key&gt;</code></pre>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("docs.anthropicTitle") }}</h3>
      </div>
      <pre class="docs-code"><code>ANTHROPIC_BASE_URL={{ apiHost }}
ANTHROPIC_API_KEY=&lt;your_gateway_key&gt;</code></pre>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("docs.claudeCodeTitle") }}</h3>
      </div>
      <pre class="docs-code"><code>export ANTHROPIC_BASE_URL={{ apiHost }}
export ANTHROPIC_API_KEY=&lt;your_gateway_key&gt;</code></pre>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>{{ t("docs.codexCliTitle") }}</h3>
      </div>
      <pre class="docs-code"><code>export OPENAI_BASE_URL={{ baseUrl }}
export OPENAI_API_KEY=&lt;your_gateway_key&gt;</code></pre>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../i18n";

const { t } = useI18n();
const origin = window.location.origin.replace(/:\d+$/, ":3000");
const apiHost = computed(() => origin);
const baseUrl = computed(() => `${origin}/v1`);
</script>
