import { Link, useLocation } from "react-router-dom";
import { Coins, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavigationProps {
  showNavigation?: boolean;
}

export const Navigation = (
    {
      showNavigation = false
    }: NavigationProps
) => {
  const location = useLocation();
  
  const links = [
    { to: "/", label: "Validators", icon: Coins },
    { to: "/portfolio", label: "Portfolio", icon: Wallet },
  ];

  if (!showNavigation){
    return null;
  }

  return (
    <nav className="flex items-center gap-1 sm:gap-2">
      {links.map((link) => {
        const isActive =
          link.to === "/"
            ? location.pathname === "/"
            : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
        const Icon = link.icon;
        
        return (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
