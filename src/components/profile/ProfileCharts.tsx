import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

export function GenreChart({ data }: { data: Array<{ genre: string; weight: number }> }) {
  return (
    <div className="h-48 rounded-xl border border-border bg-card p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="genre"
            width={92}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <RechartsTooltip cursor={{ fill: "hsl(var(--accent))" }} contentStyle={tooltipStyle} />
          <Bar dataKey="weight" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreCompareChart({
  data,
}: {
  data: Array<{ title: string; yours: number; anilist: number }>;
}) {
  return (
    <div className="h-56 rounded-xl border border-border bg-card p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="anilist"
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="yours"
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <RechartsTooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={tooltipStyle}
            formatter={(value, name) => [value, name === "anilist" ? "AniList" : "You"]}
            labelFormatter={(_, payload) =>
              (payload?.[0]?.payload as { title?: string } | undefined)?.title ?? ""
            }
          />
          <Scatter data={data} fill="hsl(var(--primary))" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
