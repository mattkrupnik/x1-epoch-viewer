import { Settings, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useChartSettings } from "@/hooks/useChartSettings";
import { useEffect, useState } from "react";

export const SettingsDialog = () => {
  const { epochCount, setEpochCount, showPostBalance, setShowPostBalance } = useChartSettings();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = stored || "light";
    setTheme(initialTheme);
  }, []);

  const toggleTheme = (checked: boolean) => {
    const newTheme = checked ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 sm:h-10 sm:w-10"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure display and chart options
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dark-mode" className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                Dark Mode
              </Label>
              <p className="text-xs text-muted-foreground">
                Toggle between light and dark theme
              </p>
            </div>
            <Switch
              id="dark-mode"
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="epochs-count">Number of Epochs</Label>
              <p className="text-xs text-muted-foreground">
                How many epochs to display in charts
              </p>
            </div>
            <Select value={epochCount.toString()} onValueChange={(value) => setEpochCount(parseInt(value))}>
              <SelectTrigger id="epochs-count" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="45">45</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-post-balance">Show Post Balance</Label>
              <p className="text-xs text-muted-foreground">
                Display post balance line on individual charts
              </p>
            </div>
            <Switch
              id="show-post-balance"
              checked={showPostBalance}
              onCheckedChange={setShowPostBalance}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
