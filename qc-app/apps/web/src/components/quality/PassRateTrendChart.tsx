'use client';

import { ExecutionTrend } from '@/types';

interface PassRateTrendChartProps {
  trends: ExecutionTrend[];
  days?: number;
}

export default function PassRateTrendChart({ trends, days = 30 }: PassRateTrendChartProps) {
  if (trends.length === 0) {
    return (
      <div className="text-center text-gray-600 dark:text-gray-400 py-8">
        No trend data available
      </div>
    );
  }

  // Sort trends by date (oldest first for chart)
  const sortedTrends = [...trends].sort((a, b) =>
    new Date(a.execution_date).getTime() - new Date(b.execution_date).getTime()
  );

  // Calculate dimensions
  const maxValue = 100; // Pass rate is 0-100%
  const chartHeight = 200;
  const chartWidth = 600;
  const padding = { top: 20, right: 40, bottom: 40, left: 50 };
  const dataWidth = chartWidth - padding.left - padding.right;
  const dataHeight = chartHeight - padding.top - padding.bottom;

  // Calculate points
  const pointSpacing = sortedTrends.length > 1 ? dataWidth / (sortedTrends.length - 1) : 0;

  const points = sortedTrends.map((trend, index) => {
    const x = padding.left + (index * pointSpacing);
    const y = padding.top + (dataHeight - (trend.daily_pass_rate_pct / maxValue * dataHeight));
    return { x, y, trend };
  });

  // Create path for line
  const linePath = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`
  ).join(' ');

  // Create path for area fill
  const areaPath = `
    M ${padding.left},${padding.top + dataHeight}
    ${points.map(p => `L ${p.x},${p.y}`).join(' ')}
    L ${padding.left + dataWidth},${padding.top + dataHeight}
    Z
  `;

  // Y-axis labels
  const yAxisLabels = [0, 25, 50, 75, 100];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto"
        style={{ maxHeight: '300px' }}
      >
        {/* Grid lines */}
        {yAxisLabels.map(value => {
          const y = padding.top + (dataHeight - (value / maxValue * dataHeight));
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + dataWidth}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                className="text-gray-200 dark:text-gray-700"
                strokeDasharray="4,4"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-gray-600 dark:fill-gray-400"
              >
                {value}%
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path
          d={areaPath}
          fill="currentColor"
          className="text-blue-500 dark:text-blue-600"
          fillOpacity="0.1"
        />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-blue-600 dark:text-blue-400"
        />

        {/* Data points */}
        {points.map((point, index) => {
          const passRate = point.trend.daily_pass_rate_pct;
          const color = passRate >= 95 ? 'text-green-600' :
                       passRate >= 80 ? 'text-yellow-600' : 'text-red-600';

          return (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="currentColor"
                className={`${color} dark:opacity-90`}
              />
              {/* Tooltip on hover - show date and pass rate */}
              <title>
                {new Date(point.trend.execution_date).toLocaleDateString()}
                {'\n'}Pass Rate: {passRate.toFixed(1)}%
                {'\n'}Passed: {point.trend.passed_count}
                {'\n'}Failed: {point.trend.failed_count}
              </title>
            </g>
          );
        })}

        {/* X-axis labels (show every few dates to avoid crowding) */}
        {points.filter((_, index) =>
          index === 0 ||
          index === points.length - 1 ||
          (points.length > 10 && index % Math.ceil(points.length / 5) === 0)
        ).map((point, index) => (
          <text
            key={index}
            x={point.x}
            y={padding.top + dataHeight + 25}
            textAnchor="middle"
            className="text-xs fill-gray-600 dark:fill-gray-400"
          >
            {new Date(point.trend.execution_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </text>
        ))}

        {/* Y-axis label */}
        <text
          x={padding.left - 35}
          y={padding.top + dataHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90, ${padding.left - 35}, ${padding.top + dataHeight / 2})`}
          className="text-xs fill-gray-600 dark:fill-gray-400 font-medium"
        >
          Pass Rate (%)
        </text>

        {/* X-axis label */}
        <text
          x={padding.left + dataWidth / 2}
          y={chartHeight - 5}
          textAnchor="middle"
          className="text-xs fill-gray-600 dark:fill-gray-400 font-medium"
        >
          Date
        </text>
      </svg>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-600"></div>
          <span className="text-gray-600 dark:text-gray-400">≥95% Pass</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
          <span className="text-gray-600 dark:text-gray-400">80-94% Pass</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-600"></div>
          <span className="text-gray-600 dark:text-gray-400">&lt;80% Pass</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-4 text-center">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Average</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {(trends.reduce((sum, t) => sum + t.daily_pass_rate_pct, 0) / trends.length).toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Best</div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {Math.max(...trends.map(t => t.daily_pass_rate_pct)).toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Worst</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {Math.min(...trends.map(t => t.daily_pass_rate_pct)).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
