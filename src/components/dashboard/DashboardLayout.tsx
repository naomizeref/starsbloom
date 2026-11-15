import React from "react";

interface DashboardLayoutProps {
  currentView?: string;
  onNavigate?: (view: string) => void;
  children: React.ReactNode;
  onOpenDeposit?: () => void;
  onOpenWithdraw?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="w-full min-w-0">
      {children}
    </div>
  );
};

