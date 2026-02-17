import { Settings, Moon, Sun, Home } from "lucide-react";
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
import { useChartSettingsSafe } from "@/hooks/useChartSettings";
import { useEffect, useState } from "react";

interface SettingsDialogProps {
  page?: "validators" | "portfolio";
}

export const SettingsDialog = ({ page = "validators" }: SettingsDialogProps) => {
  const chartSettings = useChartSettingsSafe();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [defaultPage, setDefaultPage] = useState<string>(() => {
    return localStorage.getItem("defaultPage") || "validators";
  });

  const showValidatorSettings = page === "validators" && chartSettings !== null;

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

  const handleDefaultPageChange = (value: string) => {
    setDefaultPage(value);
    localStorage.setItem("defaultPage", value);
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
            Configure display options
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
              <Label htmlFor="default-page" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Default Page
              </Label>
              <p className="text-xs text-muted-foreground">
                Page to show when opening the app
              </p>
            </div>
            <Select value={defaultPage} onValueChange={handleDefaultPageChange}>
              <SelectTrigger id="default-page" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="validators">Validators</SelectItem>
                <SelectItem value="portfolio">Portfolio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showValidatorSettings && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="epochs-count">Number of Epochs</Label>
                  <p className="text-xs text-muted-foreground">
                    How many epochs to display in charts
                  </p>
                </div>
                <Select value={chartSettings.epochCount.toString()} onValueChange={(value) => chartSettings.setEpochCount(parseInt(value))}>
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
                  checked={chartSettings.showPostBalance}
                  onCheckedChange={chartSettings.setShowPostBalance}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
