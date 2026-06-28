export function formatUsd(value?: number, options: { signed?: boolean } = {}) {
  const amount = Number(value ?? 0);
  const sign = options.signed && amount > 0 ? "+" : "";
  const [whole, fraction = ""] = amount
    .toFixed(8)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, ".00")
    .split(".");
  const formatted = `${whole}.${fraction.padEnd(2, "0")}`;

  return `${sign}$${formatted}`;
}
