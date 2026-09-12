/*
Author       : OM Academy
Description  : ApexCharts wrappers. ApexCharts can't read oklch()/var() colours, so palettes are plain hex, read
               from the current theme. ApexCharts is loaded lazily (only pages with charts pay for it).
               Every helper returns the live ApexCharts instance — call .destroy() in the page's unmount().
*/

const PALETTES = {
  light: {
    primary: "#23459d", primaryDark: "#1a3475", accent: "#1f9d55", gold: "#b3781b",
    success: "#1f9d55", warning: "#b3781b", danger: "#c23a3a", info: "#2c6fbb", slate: "#64748b",
    grid: "#e8e9ec", text: "#67707d", title: "#2f3a4b",
    series: ["#23459d", "#1f9d55", "#b3781b", "#7a4fc9", "#2c6fbb", "#c23a3a"],
  },
  dark: {
    primary: "#5b7fd4", primaryDark: "#3a5bb0", accent: "#3ecb77", gold: "#d9a441",
    success: "#3ecb77", warning: "#d9a441", danger: "#e0685f", info: "#5b9be0", slate: "#94a3b8",
    grid: "#2a2f3a", text: "#aab3c2", title: "#e4e8f0",
    series: ["#5b7fd4", "#3ecb77", "#d9a441", "#a586e8", "#5b9be0", "#e0685f"],
  },
};

export const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
export const palette = () => PALETTES[currentTheme()];

let ApexCharts;
async function load() {
  if (!ApexCharts) ApexCharts = (await import("apexcharts")).default;
  return ApexCharts;
}

function baseOptions(overrides = {}) {
  const p = palette();
  return {
    chart: { fontFamily: "Inter, sans-serif", toolbar: { show: false }, foreColor: p.text, ...(overrides.chart || {}) },
    colors: overrides.colors || p.series,
    grid: { borderColor: p.grid, strokeDashArray: 3, padding: { left: 8, right: 8 }, ...(overrides.grid || {}) },
    dataLabels: { enabled: false },
    tooltip: { theme: currentTheme() },
    legend: { fontFamily: "Inter, sans-serif", labels: { colors: p.text }, ...(overrides.legend || {}) },
    ...overrides,
  };
}

// Track live charts so the theme toggle can re-render every one of them.
const live = new Set();

async function render(el, options) {
  if (!el) return null;
  const Ctor = await load();
  const chart = new Ctor(el, options);
  await chart.render();
  live.add(chart);
  const destroy = chart.destroy.bind(chart);
  chart.destroy = () => {
    live.delete(chart);
    destroy();
  };
  return chart;
}

export async function updateTheme() {
  for (const chart of live) {
    const p = palette();
    try {
      await chart.updateOptions({ chart: { foreColor: p.text }, colors: p.series, grid: { borderColor: p.grid }, tooltip: { theme: currentTheme() }, legend: { labels: { colors: p.text } } }, false, false);
    } catch {
      /* chart may have been destroyed mid-toggle */
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("om-portal:theme", () => updateTheme());
}

/* ---------- chart shapes ---------- */

export function areaChart(el, { series, categories, height = 260, colors, yFormatter, tooltipFormatter } = {}) {
  return render(el, baseOptions({
    chart: { type: "area", height, sparkline: { enabled: false } },
    series,
    colors,
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0.02, shadeIntensity: 1 } },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { formatter: yFormatter, style: { fontSize: "11px" } } },
    tooltip: { theme: currentTheme(), y: { formatter: tooltipFormatter } },
  }));
}

export function barChart(el, { series, categories, height = 260, horizontal = false, colors, distributed = false, stacked = false, yFormatter } = {}) {
  return render(el, baseOptions({
    chart: { type: "bar", height, stacked },
    series,
    colors,
    plotOptions: { bar: { horizontal, columnWidth: "55%", borderRadius: 4, distributed } },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { formatter: yFormatter, style: { fontSize: "11px" } } },
    legend: { show: series.length > 1 },
  }));
}

export function donutChart(el, { series, labels, height = 240, colors, centerLabel } = {}) {
  const p = palette();
  return render(el, baseOptions({
    chart: { type: "donut", height },
    series,
    labels,
    colors: colors || p.series,
    stroke: { width: 2, colors: [currentTheme() === "dark" ? "#1a1e22" : "#ffffff"] },
    plotOptions: { pie: { donut: { size: "68%", labels: { show: !!centerLabel, total: { show: true, label: centerLabel || "Total", color: p.text }, value: { color: p.title, fontWeight: 700 } } } } },
    legend: { position: "bottom" },
  }));
}

export function lineChart(el, { series, categories, height = 240, colors, yFormatter } = {}) {
  return render(el, baseOptions({
    chart: { type: "line", height },
    series,
    colors,
    stroke: { curve: "smooth", width: 2.5 },
    markers: { size: 3 },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { formatter: yFormatter, style: { fontSize: "11px" } } },
  }));
}

export function radialChart(el, { series, labels, height = 220, colors } = {}) {
  const p = palette();
  return render(el, baseOptions({
    chart: { type: "radialBar", height },
    series,
    labels,
    colors: colors || [p.primary, p.accent, p.gold],
    plotOptions: { radialBar: { hollow: { size: "45%" }, dataLabels: { value: { color: p.title, fontWeight: 700 } } } },
  }));
}

export function radarChart(el, { series, categories, height = 260, colors } = {}) {
  const p = palette();
  return render(el, baseOptions({
    chart: { type: "radar", height },
    series,
    colors,
    xaxis: { categories, labels: { style: { colors: categories.map(() => p.text), fontSize: "10px" } } },
    yaxis: { show: false },
  }));
}

export function sparkline(el, { data, height = 44, color } = {}) {
  const p = palette();
  return render(el, {
    chart: { type: "line", height, sparkline: { enabled: true }, foreColor: p.text },
    series: [{ data }],
    colors: [color || p.primary],
    stroke: { curve: "smooth", width: 2 },
    tooltip: { theme: currentTheme() },
  });
}
