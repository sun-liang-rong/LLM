import { computed, ref, watch } from "vue";

export function usePagination<T>(getRows: () => T[], initialPageSize = 10) {
  const page = ref(1);
  const pageSize = ref(initialPageSize);
  const total = computed(() => getRows().length);
  const rows = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return getRows().slice(start, start + pageSize.value);
  });

  watch([total, pageSize], () => {
    const maxPage = Math.max(Math.ceil(total.value / pageSize.value), 1);
    if (page.value > maxPage) {
      page.value = maxPage;
    }
  });

  function reset() {
    page.value = 1;
  }

  return {
    page,
    pageSize,
    total,
    rows,
    reset,
  };
}
