export function normalizeFundNavRows(rows) {
  if (!Array.isArray(rows)) return [];

  const byDate = new Map();
  for (const row of rows) {
    const date = String(row?.FSRQ ?? row?.date ?? '').slice(0, 10);
    const nav = Number(row?.DWJZ ?? row?.nav);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(nav) || nav <= 0) continue;

    const growthRaw = row?.JZZZL ?? row?.growth;
    const growth = growthRaw == null || growthRaw === '' || growthRaw === '--' ? null : Number(growthRaw);
    const previous = byDate.get(date);
    byDate.set(date, {
      date,
      nav,
      // 同一净值日偶尔会出现补充记录，后者缺少涨跌幅时不能把已取得的有效值覆盖掉。
      growth: Number.isFinite(growth) ? growth : (previous?.growth ?? null),
      dividend:
        row?.dividend == null || !Number.isFinite(Number(row.dividend))
          ? (previous?.dividend ?? null)
          : Number(row.dividend)
    });
  }

  const normalized = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  return normalized.map((row, index) => {
    if (Number.isFinite(row.growth) || index === 0) return row;
    const previous = normalized[index - 1];
    if (!Number.isFinite(previous?.nav) || previous.nav <= 0) return row;
    return {
      ...row,
      growth: ((row.nav - previous.nav) / previous.nav) * 100
    };
  });
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
