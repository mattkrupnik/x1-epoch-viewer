import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { EpochReward } from "@/types/validator";
import {formatXNT} from "@/lib/format.ts";
import { useChartSettings } from "@/hooks/useChartSettings";

interface RewardsChartProps {
  epochRewards: EpochReward[];
  validatorName?: string;
  validatorAvatar?: string;
}

export const RewardsChart = ({ epochRewards, validatorName, validatorAvatar }: RewardsChartProps) => {
  const { epochCount, showPostBalance } = useChartSettings();

  const data = [...epochRewards]
    .sort((a, b) => a.epoch - b.epoch)
    .slice(-epochCount)
    .map(({ epoch, reward, commission, activeStake, postBalance }) => ({ 
      epoch, 
      reward, 
      commission, 
      activeStake,
      postBalance 
    }));
  
  return (
    <Card>
      <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0">
                  <CardTitle className="text-2xl">Rewards Trend</CardTitle>
                  <CardDescription className="text-sm">Rewards history from recent epochs</CardDescription>
              </div>
          </div>
      </CardHeader>
        <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <defs>
                <linearGradient id="colorReward" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.12}/>
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPostBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.12}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
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
              {showPostBalance && (
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
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const epochData = epochRewards.find(r => r.epoch === label);
                  return (
                      <div className="bg-card border border-border rounded-lg p-3">
                          <p className="text-sm font-medium">Epoch {label}</p>
                          {epochData?.date && (
                            <p className="text-xs text-muted-foreground">{epochData.date}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                              <div
                                  className="w-3 h-3 rounded-full flex-shrink-0 bg-success"
                              />
                              <span className="text-sm">
                                  <p className="p-0">
                                      Total Reward: {formatXNT(epochData?.reward)} XNT
                                  </p>
                                  {epochData?.activeStake !== undefined && (
                                      <p className="text-xs text-muted-foreground">
                                          Activated Stake: {formatXNT(epochData.activeStake)} XNT
                                      </p>
                                  )}
                              </span>
                          </div>
                          {showPostBalance && epochData?.postBalance !== undefined && (
                              <div className="flex items-center gap-2 mt-2">
                                  <div
                                      className="w-3 h-3 rounded-full flex-shrink-0 bg-primary"
                                  />
                                  <span className="text-sm">Post Balance: {formatXNT(epochData.postBalance)} XNT</span>
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
                  content={() => (
                      <div className="flex items-center justify-center gap-4 pt-4 flex-wrap">
                          <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-success"/>
                              <span className="text-sm">Total Rewards (XNT)
                                  <p className="text-xs text-muted-foreground">Self-Stake + Vote Rewards</p>
                              </span>
                          </div>
                          {showPostBalance && (
                              <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-primary"/>
                                  <span className="text-sm">Post Balance (XNT)
                                      <p className="text-xs text-muted-foreground">Applies to Vote account only</p>
                                  </span>
                              </div>
                          )}
                      </div>
                  )}
              />
              <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="reward"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#colorReward)"
                  dot={{ fill: 'hsl(var(--success))', r: 3 }}
                  activeDot={{ r: 5 }}
              />
              {showPostBalance && (
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="postBalance"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                    activeDot={{ r: 5 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
