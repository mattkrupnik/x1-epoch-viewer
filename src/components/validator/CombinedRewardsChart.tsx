import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart } from "recharts";
import { EpochReward } from "@/types/validator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { dashboardConfig } from "@/config/dashboard";
import {formatXNT} from "@/lib/format.ts";
import { useChartSettings } from "@/hooks/useChartSettings";

interface CombinedRewardsChartProps {
  validators: Array<{
    voteAddress: string;
    name?: string;
    avatar?: string;
    epochRewards: EpochReward[];
  }>;
}

const CHART_COLORS = [
  "hsl(217 91% 60%)",
  "hsl(262 83% 58%)",
  "hsl(142 71% 45%)",
  "hsl(32 98% 55%)",
  "hsl(340 82% 52%)",
  "hsl(176 66% 44%)",
];

export const CombinedRewardsChart = ({ validators }: CombinedRewardsChartProps) => {
  const { epochCount, showPostBalance } = useChartSettings();
  
  const [chartMode, setChartMode] = useState<'per-validator' | 'summed'>(() => {
    const saved = localStorage.getItem('chartMode');
    return (saved as 'per-validator' | 'summed') || dashboardConfig.DEFAULT_CHART_MODE;
  });

  useEffect(() => {
    localStorage.setItem('chartMode', chartMode);
  }, [chartMode]);

  const allEpochs = new Set<number>();
  validators.forEach(v => {
    v.epochRewards.forEach(r => allEpochs.add(r.epoch));
  });
  
  const sortedEpochs = Array.from(allEpochs).sort((a, b) => a - b).slice(-epochCount);
  
  const data = sortedEpochs.map(epoch => {
    const dataPoint: any = { epoch };
    
    const firstValidatorReward = validators[0]?.epochRewards.find(r => r.epoch === epoch);
    if (firstValidatorReward?.date) {
      dataPoint['date'] = firstValidatorReward.date;
    }
    
    if (chartMode === 'summed') {
      let totalReward = 0;
      let totalPostBalance = 0;
      validators.forEach((validator) => {
        const reward = validator.epochRewards.find(r => r.epoch === epoch);
        if (reward) {
          totalReward += reward.reward;
          totalPostBalance += reward.postBalance || 0;
        }
      });
      dataPoint['total'] = totalReward;
      dataPoint['totalPostBalance'] = totalPostBalance;
    } else {
      validators.forEach((validator, index) => {
        const reward = validator.epochRewards.find(r => r.epoch === epoch);
        const shortAddress = `${validator.voteAddress.slice(0, 6)}...${validator.voteAddress.slice(-4)}`;
        dataPoint[`validator_${index}`] = reward ? reward.reward : null;
        dataPoint[`validator_${index}_name`] = validator.name || shortAddress;
        dataPoint[`validator_${index}_avatar`] = validator.avatar;
        dataPoint[`validator_${index}_active_stake`] = reward?.activeStake;
        // dataPoint[`validator_${index}_post_balance`] = reward?.postBalance;
      });
    }
    
    return dataPoint;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row  gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-2xl">Combined Rewards Trend</CardTitle>
            <CardDescription className="text-sm">
              {chartMode === 'per-validator' 
                ? 'Rewards comparison across all validators' 
                : 'Total rewards sum across all validators'}
            </CardDescription>
          </div>
          {dashboardConfig.SHOW_CHART_MODE_TOGGLE && validators.length > 1 && (
            <div className="flex items-center gap-2 justify-between sm:justify-start">
              <Label htmlFor="chart-mode" className="text-sm text-muted-foreground">
                Rewards per validator
              </Label>
              <Switch
                id="chart-mode"
                checked={chartMode === 'per-validator'}
                onCheckedChange={(checked) => setChartMode(checked ? 'per-validator' : 'summed')}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <defs>
                <linearGradient id="gradient_total_summed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.12}/>
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                </linearGradient>
                {validators.map((_, index) => (
                  <linearGradient key={`gradient_${index}`} id={`gradient_${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.12}/>
                    <stop offset="95%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="epoch" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                yAxisId="left"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              {chartMode === 'summed' && showPostBalance && (
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => value > 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                  label={{
                    value: 'Post Balance (XNT)',
                    angle: 90,
                    position: 'insideRight',
                    dy: 40,
                    style: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 }
                  }}
                />
              )}
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                }}
                labelFormatter={(value) => `Epoch ${value}`}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;

                  return (
                      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">Epoch {payload[0].payload.epoch}</p>
                        {payload[0].payload.date && (
                          <p className="text-xs text-muted-foreground">{payload[0].payload.date}</p>
                        )}
                        {chartMode === 'summed' ? (
                            <div className="space-y-2 mt-2">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full flex-shrink-0 bg-success" />
                                <span className="text-sm">
                                  <p className="p-0">Total Rewards: {formatXNT(payload[0].payload.total)} XNT</p>
                                </span>
                              </div>
                              {showPostBalance && payload[0].payload.totalPostBalance > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-primary" />
                                  <span className="text-sm">Total Post Balance: {formatXNT(payload[0].payload.totalPostBalance)} XNT</span>
                                </div>
                              )}
                            </div>
                        ) : (
                            <div className="space-y-2 mt-2">
                              {payload.map((entry: any, index: number) => {
                                const validatorIndex = entry.dataKey.split('_')[1];
                                const validatorName = entry.payload[`validator_${validatorIndex}_name`];


                                return (
                                    <div key={index} className="flex items-center gap-2">
                                      <div
                                          className="w-3 h-3 rounded-full flex-shrink-0"
                                          style={{backgroundColor: entry.stroke}}
                                      />
                                      <span className="text-sm">{validatorName}: {typeof entry.value === 'number' ? formatXNT(entry.value) : entry.value || 0} XNT
                                        {/*<p className="text-xs text-muted-foreground">Post Balance: {formatXNT(entry.payload[`validator_${validatorIndex}_post_balance`])} XNT</p>*/}
                                      </span>
                                    </div>
                                );
                              })}
                            </div>
                        )}
                      </div>
                  );
                }}
              />
              <Legend
                  wrapperStyle={{
                  paddingTop: '20px',
                }}
                content={({ payload }) => {
                  if (!payload) return null;
                  
                  return (
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                      {chartMode === 'summed' ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0 bg-success" />
                            <span className="text-sm">Total Rewards (XNT)
                              <p className="text-xs text-muted-foreground">Self-Stake + Vote Rewards</p>
                            </span>
                          </div>
                          {showPostBalance && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-primary" />
                              <span className="text-sm">Post Balance (XNT)
                                <p className="text-xs text-muted-foreground">Applies to Vote account only</p>
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        payload.map((entry: any, index: number) => {
                          const validatorIndex = entry.dataKey.split('_')[1];
                          const validatorName = data[0]?.[`validator_${validatorIndex}_name`];
                          const validatorAvatar = data[0]?.[`validator_${validatorIndex}_avatar`];
                          
                          return (
                            <div key={index} className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-sm">{validatorName || `Validator ${index + 1}`}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                }}
              />
              {chartMode === 'summed' ? (
                <>
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="total"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    fill="url(#gradient_total_summed)"
                    dot={{ fill: 'hsl(var(--success))', r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  {showPostBalance && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="totalPostBalance"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  )}
                </>
              ) : (
                validators.map((_, index) => (
                  <Area 
                    key={`validator_${index}`}
                    yAxisId="left"
                    type="monotone" 
                    dataKey={`validator_${index}`}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    fill={`url(#gradient_${index})`}
                    dot={{ fill: CHART_COLORS[index % CHART_COLORS.length], r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
