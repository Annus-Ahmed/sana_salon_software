"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { formatMoney } from "@/lib/domain";
const colors = [
  "#a88b54",
  "#4f6157",
  "#d4b985",
  "#8c8e77",
  "#c1c8ba",
  "#d7cfc0",
];
export function RevenueChart({
  data,
  mode = "revenue",
}: {
  data: any[];
  mode?: string;
}) {
  return (
    <div
      className="chart-holder"
      role="img"
      aria-label="Daily earned revenue and operating expenses for the selected date range"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 12, left: 2, bottom: 5 }}
        >
          <defs>
            <linearGradient id="gold-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b7995c" stopOpacity={0.23} />
              <stop offset="100%" stopColor="#b7995c" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#eeede7"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={25}
            tick={{ fill: "#929489", fontSize: 11 }}
            dy={8}
          />
          <YAxis
            tickFormatter={(v) =>
              v === 0 ? "0" : `${Math.round(v / 100000)}k`
            }
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#929489", fontSize: 11 }}
            width={44}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            labelFormatter={(label) => `Date: ${label}`}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e3da",
              fontSize: 12,
            }}
          />
          <Area
            name={mode === "bookings" ? "Appointments" : "Earned revenue"}
            type="monotone"
            dataKey={
              mode === "collections"
                ? "collected"
                : mode === "bookings"
                  ? "bookings"
                  : "revenue"
            }
            stroke="#aa8c51"
            strokeWidth={2.5}
            fill="url(#gold-fill)"
            activeDot={{ r: 5 }}
          />
          {mode === "revenue" && (
            <Area
              name="Operating expenses"
              type="monotone"
              dataKey="expenses"
              stroke="#758274"
              strokeWidth={1.6}
              strokeDasharray="4 4"
              fill="transparent"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CategoryChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  return (
    <div
      className="category-chart"
      role="img"
      aria-label="Gross discounted service revenue by category, before later credit notes"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#75776d", fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            cursor={{ fill: "#faf8f3" }}
          />
          <Bar
            dataKey="value"
            name="Revenue"
            radius={[0, 4, 4, 0]}
            barSize={13}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
