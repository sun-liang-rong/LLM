export interface TrendChartRow {
  bucket: string;
  requests: number;
  tokens: number;
  costUsd: number;
}

export interface TrendChartTick {
  value: number;
  label: string;
  y: number;
}

export interface TrendChartPoint {
  bucket: string;
  x: number;
  requestY: number;
  costY: number;
  hitX: number;
  hitWidth: number;
  requestLabel: string;
  costLabel: string;
  tooltip: {
    bucket: string;
    requests: string;
    tokens: string;
    cost: string;
  };
}

export interface TrendChartModel {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotWidth: number;
  plotHeight: number;
  requestTicks: TrendChartTick[];
  costTicks: TrendChartTick[];
  xLabels: Array<{ label: string; x: number }>;
  points: TrendChartPoint[];
  requestLine: string;
  costLine: string;
}

const CHART = {
  width: 720,
  height: 300,
  left: 64,
  right: 668,
  top: 28,
  bottom: 236,
};

export function buildTrendChartModel(rows: TrendChartRow[]): TrendChartModel {
  const plotWidth = CHART.right - CHART.left;
  const plotHeight = CHART.bottom - CHART.top;
  const maxRequests = niceMax(Math.max(...rows.map((row) => row.requests), 0));
  const maxCost = niceMax(Math.max(...rows.map((row) => row.costUsd), 0));
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
  const pointGap = rows.length > 1 ? step : plotWidth;

  const points = rows.map((row, index) => {
    const x = rows.length > 1 ? CHART.left + step * index : CHART.left + plotWidth / 2;
    const hitWidth = Math.max(pointGap, 72);
    return {
      bucket: row.bucket,
      x,
      requestY: scaleY(row.requests, maxRequests, plotHeight),
      costY: scaleY(row.costUsd, maxCost, plotHeight),
      hitX: Math.max(CHART.left, x - hitWidth / 2),
      hitWidth:
        index === 0 || index === rows.length - 1
          ? Math.max(hitWidth / 2, 56)
          : hitWidth,
      requestLabel: formatInteger(row.requests),
      costLabel: formatCurrency(row.costUsd),
      tooltip: {
        bucket: row.bucket,
        requests: formatInteger(row.requests),
        tokens: formatCompact(row.tokens),
        cost: formatCurrency(row.costUsd),
      },
    };
  });

  return {
    ...CHART,
    plotWidth,
    plotHeight,
    requestTicks: buildTicks(maxRequests, formatCompact, plotHeight),
    costTicks: buildTicks(maxCost, formatCurrency, plotHeight),
    xLabels: buildXLabels(points),
    points,
    requestLine: points.map((point) => `${point.x},${point.requestY}`).join(" "),
    costLine: points.map((point) => `${point.x},${point.costY}`).join(" "),
  };
}

function buildTicks(
  maxValue: number,
  formatter: (value: number) => string,
  plotHeight: number,
) {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue * ratio;
    return {
      value,
      label: formatter(value),
      y: CHART.bottom - ratio * plotHeight,
    };
  }).reverse();
}

function buildXLabels(points: TrendChartPoint[]) {
  if (points.length <= 6) {
    return points.map((point) => ({ label: point.bucket, x: point.x }));
  }
  const selected = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  return points
    .filter((_, index) => selected.has(index))
    .map((point) => ({ label: point.bucket, x: point.x }));
}

function scaleY(value: number, maxValue: number, plotHeight: number) {
  return CHART.bottom - (value / maxValue) * plotHeight;
}

function niceMax(value: number) {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Math.round(value || 0));
}

function formatCompact(value: number) {
  if (!value) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatInteger(value);
}

function formatCurrency(value: number) {
  return `$${Number(value || 0).toFixed(4)}`;
}
