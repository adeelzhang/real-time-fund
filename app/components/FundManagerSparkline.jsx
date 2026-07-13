'use client';

export default function FundManagerSparkline({ values = [], positive }) {
  const points = values.map(Number).filter(Number.isFinite);
  if (points.length < 2) return <span className="fund-manager-sparkline-empty">—</span>;

  const width = 120;
  const height = 42;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const coordinates = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const isPositive = positive ?? points[points.length - 1] >= points[0];
  const color = isPositive ? 'var(--danger)' : 'var(--success)';
  const area = [`0,${height}`, ...coordinates, `${width},${height}`].join(' ');

  return (
    <svg className="fund-manager-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={area} fill={color} opacity="0.1" />
      <polyline
        points={coordinates.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
