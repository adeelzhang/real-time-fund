export function normalizeFundNavRows(rows) {
  if (!Array.isArray(rows)) return [];

  const byDate = new Map();
  for (const row of rows) {
    const date = String(row?.FSRQ ?? row?.date ?? '').slice(0, 10);
    const nav = Number(row?.DWJZ ?? row?.nav);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(nav) || nav <= 0) continue;

    const growthRaw = row?.JZZZL ?? row?.growth;
    const growth = growthRaw == null || growthRaw === '' || growthRaw === '--' ? null : Number(growthRaw);
    byDate.set(date, {
      date,
      nav,
      growth: Number.isFinite(growth) ? growth : null,
      dividend: row?.dividend == null || !Number.isFinite(Number(row.dividend)) ? null : Number(row.dividend)
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function parseFundDividend(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  if (!/[派分红]/.test(text)) return null;
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
