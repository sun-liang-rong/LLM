export function formatUsd(value?: number, options: { signed?: boolean } = {}) {
  const amount = Number(value ?? 0);
  const sign = options.signed && amount > 0 ? "+" : "";

  return `${sign}$${amount.toFixed(2)}`;
}
