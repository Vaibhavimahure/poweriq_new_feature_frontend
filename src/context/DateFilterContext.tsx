import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import {
  calculateBillingWindow,
  BillingWindowResult,
  getProductionTodayWindow,
} from "../utils/dashboardWindowUtils";
import { CustomDateRange } from "../components/common/DateRangeSelector";
import { fetchMyCompany } from "../api/companyApi";

interface DateFilterContextType {
  selectedYear: number;
  selectedMonth: number;
  billingCycleDay: number;
  productionTimeEnabled: boolean;
  customRange: CustomDateRange | null;
  billingWindow: BillingWindowResult;
  activeFromSec: number;
  activeToSec: number;
  resolvedDateRange: { from: string; to: string; label: string };
  setSelectedYear: (year: number) => void;
  setSelectedMonth: (month: number) => void;
  setBillingCycleDay: (day: number) => void;
  setProductionTimeEnabled: (enabled: boolean) => void;
  setCustomRange: (range: CustomDateRange | null) => void;
  handlePeriodChange: (year: number, month: number) => void;
  handleProductionTimeToggle: (enabled: boolean) => void;
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined);

export const DateFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const anchorDate = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(anchorDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(anchorDate.getMonth());
  const [billingCycleDay, setBillingCycleDay] = useState<number>(1);
  const [productionTimeEnabled, setProductionTimeEnabled] = useState(true);

  // Initialize with Today (Production Time basis 06:00 - 06:00)
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(() => {
    const today = getProductionTodayWindow({ basis: "production", shiftStart: "06:00" });
    return {
      mode: "today",
      fromSec: today.fromSec,
      toSec: today.toSec,
      prevFromSec: today.prevFromSec,
      prevToSec: today.prevToSec,
      label: today.label,
      subLabel: today.subLabel,
      displayModeName: "Today",
      basis: "production",
    };
  });

  // Load billing cycle day from company profile
  useEffect(() => {
    let alive = true;
    fetchMyCompany()
      .then((comp) => {
        if (!alive || !comp) return;
        if (comp.billingCycleStartDay) {
          setBillingCycleDay(Number(comp.billingCycleStartDay));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleProductionTimeToggle = useCallback(
    (enabled: boolean) => {
      setProductionTimeEnabled(enabled);
      if (customRange?.mode === "today") {
        const today = getProductionTodayWindow({
          basis: enabled ? "production" : "calendar",
          shiftStart: "06:00",
        });
        setCustomRange({
          mode: "today",
          fromSec: today.fromSec,
          toSec: today.toSec,
          prevFromSec: today.prevFromSec,
          prevToSec: today.prevToSec,
          label: today.label,
          subLabel: today.subLabel,
          displayModeName: "Today",
          basis: enabled ? "production" : "calendar",
        });
      }
    },
    [customRange?.mode]
  );

  const billingWindow: BillingWindowResult = useMemo(
    () => calculateBillingWindow(selectedYear, selectedMonth, billingCycleDay, anchorDate),
    [selectedYear, selectedMonth, billingCycleDay, anchorDate]
  );

  const handlePeriodChange = useCallback((year: number, month: number) => {
    setCustomRange(null);
    setSelectedYear(year);
    setSelectedMonth(month);
  }, []);

  const activeFromSec = customRange ? customRange.fromSec : billingWindow.fromSec;
  const activeToSec = customRange ? customRange.toSec : billingWindow.toSec;

  const resolvedDateRange = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toYmd = (sec: number) => {
      const d = new Date(sec * 1000);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    if (customRange?.startDate && customRange?.endDate) {
      return {
        from: customRange.startDate,
        to: customRange.endDate,
        label: customRange.label,
      };
    }

    if (customRange?.selectedDate) {
      return {
        from: customRange.selectedDate,
        to: customRange.selectedDate,
        label: customRange.label,
      };
    }

    if (customRange?.mode === "today") {
      const todayYmd = toYmd(activeFromSec);
      return {
        from: todayYmd,
        to: todayYmd,
        label: "Today",
      };
    }

    const from = toYmd(activeFromSec);
    const to = toYmd(activeToSec);
    return {
      from,
      to,
      label: customRange?.label || billingWindow.windowText,
    };
  }, [customRange, activeFromSec, activeToSec, billingWindow]);

  const value = useMemo(
    () => ({
      selectedYear,
      selectedMonth,
      billingCycleDay,
      productionTimeEnabled,
      customRange,
      billingWindow,
      activeFromSec,
      activeToSec,
      resolvedDateRange,
      setSelectedYear,
      setSelectedMonth,
      setBillingCycleDay,
      setProductionTimeEnabled,
      setCustomRange,
      handlePeriodChange,
      handleProductionTimeToggle,
    }),
    [
      selectedYear,
      selectedMonth,
      billingCycleDay,
      productionTimeEnabled,
      customRange,
      billingWindow,
      activeFromSec,
      activeToSec,
      resolvedDateRange,
      handlePeriodChange,
      handleProductionTimeToggle,
    ]
  );

  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
};

export const useDateFilter = (): DateFilterContextType => {
  const context = useContext(DateFilterContext);
  if (!context) {
    throw new Error("useDateFilter must be used within a DateFilterProvider");
  }
  return context;
};
