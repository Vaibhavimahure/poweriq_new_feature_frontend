/**
 * ProductSecScreen.tsx
 * ----------------------------------------------------------------------------
 * Product-Wise Specific Energy Consumption (SEC) Screen:
 * - Header: AppHeader (standard branding & navigation)
 * - Calendar: Shared standard DateRangeSelector (Day | Range | Billing Cycle)
 * - Product Section:
 *   - Clean Search Bar (search products by name or ID)
 *   - All products rendered as comprehensive expandable cards
 *   - Products with active data for the selected date range sorted to the top
 *   - Each product card features:
 *     - Product Name & ID
 *     - Individual [ Logs ] button to view/add production logs
 *     - Chevron expand/collapse toggle
 *     - 7 KPI metric tiles (Primary Qty, Secondary Qty, Wastage Qty, Total Energy, SEC, Total Cost, Cost/unit)
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import {
  Box,
  Zap,
  BarChart2,
  Coins,
  Calculator,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  ClipboardList,
  Info,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import {
  fetchSecOverview,
  fetchSecProductConfigs,
} from "../../api/secApi";
import { CONFIG } from "../../config/constants";
import { CardSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../components/common/ErrorCard";
import { AppFooter } from "../../components/common/AppFooter";
import { AppHeader } from "../../components/common/AppHeader";
import { DateRangeSelector } from "../../components/common/DateRangeSelector";
import { useDateFilter } from "../../context/DateFilterContext";

export const ProductSecScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Products state
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Map of collapsed/expanded product cards (default: all expanded or first 5 expanded)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Global Date Filter Context
  const {
    billingWindow,
    customRange,
    setCustomRange,
    handlePeriodChange,
    productionTimeEnabled,
    handleProductionTimeToggle,
    resolvedDateRange,
  } = useDateFilter();

  // Data Fetching
  const loadData = useCallback(async (force = false) => {
    try {
      if (!force) setLoading(true);
      setError(null);

      const params: any = {};
      if (resolvedDateRange?.from && resolvedDateRange?.to) {
        params.productionDateFrom = resolvedDateRange.from;
        params.productionDateTo = resolvedDateRange.to;
      }

      const overview = await fetchSecOverview(force, params);
      let list: any[] = Array.isArray(overview?.products) ? overview.products : [];

      if (!list.length) {
        list = await fetchSecProductConfigs();
      }

      setProducts(list);
    } catch (err: any) {
      console.warn("[ProductSecScreen] Load failed:", err?.message);
      setError("Failed to load Product SEC data. Please check connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedDateRange?.from, resolvedDateRange?.to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Number Formatters
  const formatNum = (v: any, decimals = 2) => {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  };

  // Helper to determine if a product has active logs or energy data for the period
  const hasActiveData = (p: any) => {
    const s = p?.summary || {};
    const logs = Number(s?.logCount || p?.logCount || 0);
    const sec = s?.secPerProductionUnit ?? s?.sec ?? p?.secPerProductionUnit ?? p?.sec;
    const energy = Number(s?.tec ?? s?.totalEnergy ?? p?.totalEnergy ?? 0);
    const qty = Number(
      s?.primaryProductionQtyEntered ??
        s?.grossProductionQty ??
        s?.qtyProduced ??
        p?.primaryProductionQtyEntered ??
        0
    );
    return logs > 0 || sec != null || energy > 0 || qty > 0;
  };

  // Filtered & Sorted Product List:
  // 1. Matched by search query
  // 2. Products with active data for the period appear on TOP
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const matched = products.filter((p) => {
      if (!q) return true;
      const name = String(p.name || p.productName || "").toLowerCase();
      const id = String(p.productId || p._id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });

    matched.sort((a, b) => {
      const aData = hasActiveData(a) ? 1 : 0;
      const bData = hasActiveData(b) ? 1 : 0;
      if (aData !== bData) {
        return bData - aData; // Products with data on top
      }
      const aName = String(a.name || a.productName || "");
      const bName = String(b.name || b.productName || "");
      return aName.localeCompare(bName);
    });

    return matched;
  }, [products, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id], // Default is expanded
    }));
  };

  const isCardExpanded = (id: string) => {
    return expandedIds[id] !== false; // Default true
  };

  return (
    <View style={styles.container}>
      {/* 1. App Header */}
      <AppHeader />

      {/* 2. Standard Universal Calendar / Time Window Selector */}
      <DateRangeSelector
        billingWindow={billingWindow}
        onPeriodChange={handlePeriodChange}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        isProductionTime={productionTimeEnabled}
        onProductionTimeToggle={handleProductionTimeToggle}
      />

      {/* 3. Search Bar Header (No filter up there - just clean search) */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search product name or ID..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.searchClearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.productCountBadge}>
          <Text style={styles.productCountText}>
            {filteredProducts.length} {filteredProducts.length === 1 ? "Product" : "Products"}
          </Text>
        </View>
      </View>

      {/* 4. Products List Scroll Area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[CONFIG.THEME.primary]}
            tintColor={CONFIG.THEME.primary}
          />
        }
      >
        {loading && !refreshing ? (
          <View style={{ padding: 16 }}>
            <CardSkeleton height={120} />
            <CardSkeleton height={120} />
            <CardSkeleton height={120} />
          </View>
        ) : error ? (
          <ErrorCard title="Error" message={error} onRetry={() => loadData(true)} />
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Box size={44} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Products Found</Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? `No products matching "${searchQuery}".`
                : "No products configured for this plant."}
            </Text>
          </View>
        ) : (
          filteredProducts.map((p, index) => {
            const pId = String(p?.productId || p?._id || `prod_${index}`);
            const pName = String(p?.name || p?.productName || pId);
            const pSize = String(p?.size ?? "—");
            const primaryUnit = p?.primaryProductUnit || p?.productUnit || "kg";
            const secondaryUnit = p?.secondaryProductUnit || "mts";

            const summary = p?.summary || (p?.secPerProductionUnit != null ? p : {});
            const hasData = hasActiveData(p);
            const expanded = isCardExpanded(pId);

            const primaryQty =
              summary.primaryProductionQtyEntered ??
              summary.productionQtyEntered ??
              summary.qtyProduced ??
              null;
            const secondaryQty = summary.secondaryProductionQtyEntered ?? null;
            const wastageQty = summary.wastageQty ?? null;
            const tec = summary.tec ?? summary.totalEnergy ?? null;
            const sec = summary.secPerProductionUnit ?? summary.sec ?? null;
            const totalCost = summary.totalCost ?? null;
            const costPerUnit =
              summary.costPerProductionUnit ??
              summary.costPerUnit ??
              (primaryQty && totalCost && Number(primaryQty) > 0
                ? Number(totalCost) / Number(primaryQty)
                : null);

            return (
              <View key={pId} style={styles.productCardContainer}>
                {/* Header: Box Icon + Product Name & ID + Logs Button + Expand Toggle */}
                <View style={styles.productCardHeader}>
                  <TouchableOpacity
                    style={styles.productCardHeaderLeft}
                    activeOpacity={0.7}
                    onPress={() => toggleExpand(pId)}
                  >
                    <View style={styles.boxIconWrapper}>
                      <Box size={20} color="#0F172A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productCardTitle} numberOfLines={1}>
                        {pName}
                      </Text>
                      <Text style={styles.productCardSub} numberOfLines={1}>
                        ID: {pId}{pSize !== "—" ? ` • Size: ${pSize}` : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.headerRightActions}>
                    {/* Individual Logs Button */}
                    <TouchableOpacity
                      style={styles.logsButton}
                      onPress={() => {
                        navigation.navigate("ProductLogs", {
                          productId: pId,
                          productName: pName,
                          unit: primaryUnit,
                          secondaryUnit,
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      <ClipboardList size={14} color="#FFFFFF" />
                      <Text style={styles.logsButtonText}>Logs</Text>
                    </TouchableOpacity>

                    {/* Expand/Collapse Chevron */}
                    <TouchableOpacity
                      onPress={() => toggleExpand(pId)}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                      style={styles.chevronButton}
                    >
                      {expanded ? (
                        <ChevronUp size={22} color="#2563EB" strokeWidth={2.5} />
                      ) : (
                        <ChevronDown size={22} color="#2563EB" strokeWidth={2.5} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Expanded: 7 Metric Tiles Grid */}
                {expanded && (
                  <View style={styles.metricsGrid}>
                    {/* Row 1: Primary Qty & Secondary Qty */}
                    <View style={styles.metricRow}>
                      {/* 1. Primary Production Quantity */}
                      <View style={[styles.metricCard, { backgroundColor: "#F0FDF4" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#DCFCE7" }]}>
                          <Zap size={20} color="#22C55E" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            Primary Production Quantity
                          </Text>
                          <Text style={styles.metricValue}>
                            {primaryQty !== null ? formatNum(primaryQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{primaryUnit}</Text>
                        </View>
                      </View>

                      {/* 2. Secondary Production Quantity */}
                      <View style={[styles.metricCard, { backgroundColor: "#EFF6FF" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#DBEAFE" }]}>
                          <BarChart2 size={20} color="#2563EB" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            Secondary Production Quantity
                          </Text>
                          <Text style={styles.metricValue}>
                            {secondaryQty !== null ? formatNum(secondaryQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{secondaryUnit}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Row 2: Wastage Qty & Total Energy Consumption */}
                    <View style={styles.metricRow}>
                      {/* 3. Wastage Quantity */}
                      <View style={[styles.metricCard, { backgroundColor: "#FFF7ED" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#FFEDD5" }]}>
                          <Coins size={20} color="#EA580C" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            Wastage Quantity
                          </Text>
                          <Text style={styles.metricValue}>
                            {wastageQty !== null ? formatNum(wastageQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{primaryUnit}</Text>
                        </View>
                      </View>

                      {/* 4. Total Energy Consumption */}
                      <View style={[styles.metricCard, { backgroundColor: "#F0FDF4" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#DCFCE7" }]}>
                          <Zap size={20} color="#16A34A" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            Total Energy Consumption
                          </Text>
                          <Text style={styles.metricValue}>
                            {tec !== null ? formatNum(tec, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>kWh</Text>
                        </View>
                      </View>
                    </View>

                    {/* Row 3: SEC / kg & Total Cost */}
                    <View style={styles.metricRow}>
                      {/* 5. SEC / unit */}
                      <View style={[styles.metricCard, { backgroundColor: "#FAF5FF" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#EDE9FE" }]}>
                          <BarChart2 size={20} color="#2563EB" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            SEC / {primaryUnit}
                          </Text>
                          <Text style={styles.metricValue}>
                            {sec !== null ? formatNum(sec, 4) : "—"}
                          </Text>
                          <Text style={styles.metricUnit}>kWh / {primaryUnit}</Text>
                        </View>
                      </View>

                      {/* 6. Total Cost */}
                      <View style={[styles.metricCard, { backgroundColor: "#FFF7ED" }]}>
                        <View style={[styles.metricIconBox, { backgroundColor: "#FFEDD5" }]}>
                          <Coins size={20} color="#EA580C" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={2}>
                            Total Cost
                          </Text>
                          <Text style={styles.metricValue}>
                            {totalCost !== null ? formatNum(totalCost, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>₹</Text>
                        </View>
                      </View>
                    </View>

                    {/* Row 4: Cost / unit (Full width) */}
                    <View style={[styles.fullWidthMetricCard, { backgroundColor: "#FAF5FF" }]}>
                      <View style={[styles.metricIconBox, { backgroundColor: "#EDE9FE" }]}>
                        <Calculator size={20} color="#7C3AED" />
                      </View>
                      <View style={styles.metricContent}>
                        <Text style={styles.metricLabel} numberOfLines={1}>
                          Cost / {primaryUnit}
                        </Text>
                        <Text style={styles.metricValue}>
                          {costPerUnit !== null ? formatNum(costPerUnit, 2) : "—"}
                        </Text>
                        <Text style={styles.metricUnit}>₹ / {primaryUnit}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="SEC" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  // Search row
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
  },
  productCountBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  productCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  // Scroll Content
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Empty State
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  // Product Card Container
  productCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  productCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  productCardHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  boxIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  productCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 20,
  },
  productCardSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logsButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 4,
  },
  chevronButton: {
    padding: 2,
  },
  // Metrics Grid
  metricsGrid: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 110,
    justifyContent: "space-between",
  },
  fullWidthMetricCard: {
    borderRadius: 14,
    padding: 14,
    minHeight: 85,
    justifyContent: "space-between",
  },
  metricIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  metricContent: {
    justifyContent: "flex-end",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 16,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 24,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
});
