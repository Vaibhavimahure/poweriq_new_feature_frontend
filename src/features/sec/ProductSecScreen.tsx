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
 *   - Each expanded product card features EXACTLY 8 metric tiles in exact order:
 *     1. Target Production
 *     2. Target Cost / {unit}
 *     3. Energy Consumption
 *     4. Production Runtime (Primary Machine Efficient Run Time 'full_load')
 *     5. Primary Production
 *     6. Secondary Production
 *     7. Wastage
 *     8. Machine Cost / {unit}
 *   - Dedicated Logs button to view/add production logs
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
  Alert,
} from "react-native";
import {
  Box,
  Zap,
  BarChart2,
  Coins,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  ClipboardList,
  Target,
  Clock,
  Info,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import {
  fetchSecOverview,
  fetchSecProductConfigs,
  fetchSecProductHistory,
  fetchSecProductTargets,
} from "../../api/secApi";
import { fetchFavoriteMachines } from "../../api/kpiApi";
import {
  getPrimaryDevices,
  getPrimaryDids,
  parseEfficientRunTimeHours,
  formatRuntimeHours,
  formatNum,
  metricFromSummary,
  mapWithConcurrency,
  getProductTargetProduction,
  getProductTargetCost,
  formatTargetProduction,
  formatTargetCost,
} from "../../utils/secUtils";
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

  // Products and metrics state
  const [products, setProducts] = useState<any[]>([]);
  const [productMetrics, setProductMetrics] = useState<Record<string, any>>({});
  const [productTargets, setProductTargets] = useState<Record<string, any>>({});
  const [machineRuntimes, setMachineRuntimes] = useState<Record<string, number | null>>({});
  const [searchQuery, setSearchQuery] = useState("");

  // Map of collapsed/expanded product cards (default: all expanded)
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
    activeFromSec,
    activeToSec,
  } = useDateFilter();

  // Data Fetching: Products list, Product History metrics, and Machine Runtimes
  const loadData = useCallback(
    async (force = false) => {
      try {
        if (!force) setLoading(true);
        setError(null);

        const productionDateFrom = resolvedDateRange?.from || "";
        const productionDateTo = resolvedDateRange?.to || "";
        const queryMode = customRange?.label ? "custom" : "today";

        // 1. Fetch configured products list & favorite machine cards in parallel
        const [overviewRes, favRes] = await Promise.allSettled([
          fetchSecOverview(force, {
            productionDateFrom: productionDateFrom || undefined,
            productionDateTo: productionDateTo || undefined,
          }),
          fetchFavoriteMachines({
            from: activeFromSec,
            to: activeToSec,
            mode: queryMode,
          }),
        ]);

        let configuredProducts: any[] = [];
        if (overviewRes.status === "fulfilled" && overviewRes.value) {
          configuredProducts = Array.isArray(overviewRes.value?.products)
            ? overviewRes.value.products
            : [];
        }

        // Fallback to sec-config if overview products empty
        if (!configuredProducts.length) {
          try {
            configuredProducts = await fetchSecProductConfigs();
          } catch {
            configuredProducts = [];
          }
        }

        setProducts(configuredProducts);

        // 2. Parse initial runtime map from favorite cards
        const runtimeMap: Record<string, number | null> = {};
        if (favRes.status === "fulfilled" && favRes.value) {
          const val = favRes.value;
          const favList = Array.isArray(val?.favorites)
            ? val.favorites
            : Array.isArray(val?.cards)
            ? val.cards
            : Array.isArray(val?.data)
            ? val.data
            : Array.isArray(val)
            ? val
            : [];

          favList.forEach((fav: any) => {
            const didKey = String(fav?.did || fav?.deviceId || fav?.id || "").trim().toUpperCase();
            if (!didKey) return;
            const rt = parseEfficientRunTimeHours(fav);
            if (rt !== null) {
              runtimeMap[didKey] = rt;
            }
          });
        }

        // 3. Collect all unique Primary Machine DIDs across configured products
        const allPrimaryDids = new Set<string>();
        configuredProducts.forEach((p) => {
          const dids = getPrimaryDids(p);
          dids.forEach((did) => allPrimaryDids.add(did));
        });

        // 4. For any Primary Machine DIDs not present in favorite cards, fetch their runtime
        const missingDids = Array.from(allPrimaryDids).filter(
          (did) => runtimeMap[did] === undefined
        );

        if (missingDids.length > 0) {
          await mapWithConcurrency(missingDids, 5, async (did) => {
            try {
              const res = await fetchFavoriteMachines({
                did,
                from: activeFromSec,
                to: activeToSec,
                mode: queryMode,
              });
              const card =
                res?.favorites?.[0] ||
                res?.cards?.[0] ||
                (Array.isArray(res?.data) ? res.data[0] : res?.data) ||
                res;
              const rt = parseEfficientRunTimeHours(card);
              runtimeMap[did] = rt;
            } catch {
              runtimeMap[did] = null;
            }
          });
        }

        setMachineRuntimes(runtimeMap);

        // 5. Fetch date-range summary metrics for each product via history API
        // Matches Web Dashboard index.jsx mapWithConcurrency(products, 8, ...)
        if (configuredProducts.length > 0 && productionDateFrom && productionDateTo) {
          const metricsEntries = await mapWithConcurrency(
            configuredProducts,
            8,
            async (product) => {
              const pId = String(product?.productId || product?.id || product?._id || "").trim();
              if (!pId) return [pId, null] as const;

              try {
                const history = await fetchSecProductHistory(pId, {
                  page: 1,
                  limit: 1,
                  productionDateFrom,
                  productionDateTo,
                });
                const summary = history?.summary || history?.data?.summary;
                const rows = Array.isArray(history?.rows)
                  ? history.rows
                  : Array.isArray(history?.data?.rows)
                  ? history.data.rows
                  : [];
                const parsedMetric = metricFromSummary(summary, rows[0] || null);
                return [pId, parsedMetric] as const;
              } catch {
                // Fall back to embedded summary if individual history fetch fails
                const fallback = metricFromSummary(product?.summary, null);
                return [pId, fallback] as const;
              }
            }
          );

          setProductMetrics(Object.fromEntries(metricsEntries));
        } else {
          // If no date range, map directly from embedded product summary
          const directEntries = configuredProducts.map((p) => {
            const pId = String(p?.productId || p?.id || p?._id || "").trim();
            return [pId, metricFromSummary(p?.summary, null)] as const;
          });
          setProductMetrics(Object.fromEntries(directEntries));
        }

        // 6. Fetch date-range dynamic targets for each product
        // Matches Web Dashboard index.jsx fetchSecProductTargets({ productionDateFrom, productionDateTo })
        if (configuredProducts.length > 0 && productionDateFrom && productionDateTo) {
          try {
            const targetsRes = await fetchSecProductTargets({
              productionDateFrom,
              productionDateTo,
              forceRefresh: force,
            });
            const targetsData =
              targetsRes?.targets && typeof targetsRes.targets === "object"
                ? targetsRes.targets
                : targetsRes?.data?.targets && typeof targetsRes.data.targets === "object"
                ? targetsRes.data.targets
                : targetsRes && typeof targetsRes === "object"
                ? targetsRes
                : {};
            setProductTargets(targetsData);
          } catch (tErr: any) {
            console.warn("[ProductSecScreen] fetchSecProductTargets failed:", tErr?.message);
            setProductTargets({});
          }
        } else {
          setProductTargets({});
        }
      } catch (err: any) {
        console.warn("[ProductSecScreen] Load failed:", err?.message);
        setError("Failed to load Product SEC data. Please check connection.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFromSec, activeToSec, customRange?.label, resolvedDateRange?.from, resolvedDateRange?.to]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Helper to determine if a product has active logs or energy data for the period
  const hasActiveData = (p: any, m: any) => {
    const s = m || p?.summary || {};
    const logs = Number(s?.logCount || 0);
    const sec = s?.secPerProductionUnit ?? s?.sec;
    const energy = Number(s?.tec ?? s?.totalEnergy ?? 0);
    const qty = Number(
      s?.primaryProductionQtyEntered ??
      s?.grossProductionQty ??
      s?.qtyProduced ??
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
      const aId = String(a.productId || a._id || "");
      const bId = String(b.productId || b._id || "");
      const aMetric = productMetrics[aId];
      const bMetric = productMetrics[bId];

      const aDate = new Date(aMetric?.productionTo || aMetric?.productionDate || 0).getTime();
      const bDate = new Date(bMetric?.productionTo || bMetric?.productionDate || 0).getTime();
      const aTime = Number.isFinite(aDate) ? aDate : 0;
      const bTime = Number.isFinite(bDate) ? bDate : 0;

      // 1. Web Dashboard Latest Production First: latest production date/timestamp descending
      if (bTime !== aTime) {
        return bTime - aTime;
      }

      // 2. Web Dashboard tie-breaker: alphabetical by product name
      const aName = String(a.name || a.productName || "");
      const bName = String(b.name || b.productName || "");
      return aName.localeCompare(bName, undefined, { sensitivity: "base", numeric: true });
    });

    return matched;
  }, [products, productMetrics, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id], // Default is expanded
    }));
  };

  const isCardExpanded = (id: string) => {
    return expandedIds[id] !== false; // Default true (expanded)
  };

  // Breakdown alert for multiple primary machines on a product
  const showMultipleMachineBreakdown = (productName: string, primaryDevices: any[]) => {
    const lines = primaryDevices.map((d: any) => {
      const did = String(d?.did || "").trim().toUpperCase();
      const name = String(d?.name || d?.panelName || d?.label || did).trim();
      const hrs = machineRuntimes[did];
      return `• ${name} (${did}): ${formatRuntimeHours(hrs)}`;
    });

    Alert.alert(
      `Primary Machines Runtime`,
      `Product: ${productName}\n\n${lines.join("\n")}`,
      [{ text: "Close", style: "cancel" }]
    );
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

      {/* 3. Search Bar Header */}
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
            <CardSkeleton height={140} />
            <CardSkeleton height={140} />
            <CardSkeleton height={140} />
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
            const pId = String(p?.productId || p?.id || p?._id || `prod_${index}`).trim();
            const pName = String(p?.name || p?.productName || pId);
            const pSize = String((p?.size || p?.productSize) ?? "—");
            const primaryUnit = String(p?.primaryProductUnit || p?.productUnit || "pcs").trim();
            const secondaryUnit = String(p?.secondaryProductUnit || p?.primaryProductUnit || "pcs").trim();

            const metric = productMetrics[pId] || metricFromSummary(p?.summary, null);
            const expanded = isCardExpanded(pId);

            // 8 Metrics Data Values
            const primaryQty = metric?.primaryProductionQtyEntered ?? null;
            const secondaryQty = metric?.secondaryProductionQtyEntered ?? null;
            const wastageQty = metric?.wastageQty ?? null;
            const tec = metric?.tec ?? metric?.totalEnergy ?? null;
            const costPerUnit = metric?.costPerProductionUnit ?? metric?.costPerUnit ?? null;

            // Target Metrics (underlying raw values preserve null when unconfigured)
            const targetObj = productTargets[pId] || null;
            const rawTargetProd = getProductTargetProduction(p, metric, targetObj);
            const rawTargetCost = getProductTargetCost(p, metric, targetObj);

            // Production Runtime from configured Primary Machine(s)
            const primaryDevices = getPrimaryDevices(p);
            let runtimeFormatted = "—";
            let runtimeSubtitle = "No primary machine";
            let hasMultipleMachines = false;

            if (primaryDevices.length === 1) {
              const did = String(primaryDevices[0].did).trim().toUpperCase();
              const mName = String(primaryDevices[0].name || primaryDevices[0].panelName || did).trim();
              const hrs = machineRuntimes[did];
              runtimeFormatted = formatRuntimeHours(hrs);
              runtimeSubtitle = mName || did;
            } else if (primaryDevices.length > 1) {
              hasMultipleMachines = true;
              runtimeFormatted = "—";
              runtimeSubtitle = `${primaryDevices.length} machines (Tap for info)`;
            }

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

                {/* Expanded: EXACTLY 8 Metric Tiles Grid (2 columns x 4 rows) */}
                {expanded && (
                  <View style={styles.metricsGrid}>
                    {/* Row 1: Target Production | Target Cost / unit */}
                    <View style={styles.metricRow}>
                      {/* Tile 1: Target Production */}
                      <View style={[styles.metricCard, styles.cardGray]}>
                        <View style={[styles.metricIconBox, styles.iconBoxGray]}>
                          <Target size={18} color="#64748B" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Target Production
                          </Text>
                          <Text style={[styles.metricValue, { color: "#334155" }]}>
                            {formatTargetProduction(rawTargetProd)}
                          </Text>
                          <Text style={styles.metricUnit}>{primaryUnit}</Text>
                        </View>
                      </View>

                      {/* Tile 2: Target Cost / unit */}
                      <View style={[styles.metricCard, styles.cardPurple]}>
                        <View style={[styles.metricIconBox, styles.iconBoxPurple]}>
                          <Coins size={18} color="#7C3AED" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Target Cost / {primaryUnit}
                          </Text>
                          <Text style={[styles.metricValue, { color: "#7C3AED" }]}>
                            {formatTargetCost(rawTargetCost)}
                          </Text>
                          <Text style={styles.metricUnit}>/{primaryUnit}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Row 2: Energy Consumption | Production Runtime */}
                    <View style={styles.metricRow}>
                      {/* Tile 3: Energy Consumption */}
                      <View style={[styles.metricCard, styles.cardBlue]}>
                        <View style={[styles.metricIconBox, styles.iconBoxBlue]}>
                          <Zap size={18} color="#2563EB" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Energy Consumption
                          </Text>
                          <Text style={[styles.metricValue, { color: "#2563EB" }]}>
                            {tec !== null ? formatNum(tec, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>kWh</Text>
                        </View>
                      </View>

                      {/* Tile 4: Production Runtime (Primary Machine Efficient Run Time) */}
                      <TouchableOpacity
                        activeOpacity={hasMultipleMachines ? 0.75 : 1}
                        onPress={() => {
                          if (hasMultipleMachines) {
                            showMultipleMachineBreakdown(pName, primaryDevices);
                          }
                        }}
                        style={[styles.metricCard, styles.cardGreen]}
                      >
                        <View style={[styles.metricIconBox, styles.iconBoxGreen]}>
                          <Clock size={18} color="#16A34A" />
                        </View>
                        <View style={styles.metricContent}>
                          <View style={styles.labelWithInfo}>
                            <Text style={styles.metricLabel} numberOfLines={1}>
                              Production Runtime
                            </Text>
                            {hasMultipleMachines && (
                              <Info size={11} color="#16A34A" style={{ marginLeft: 3 }} />
                            )}
                          </View>
                          <Text style={[styles.metricValue, { color: "#16A34A" }]}>
                            {runtimeFormatted}
                          </Text>
                          <Text style={styles.metricUnit} numberOfLines={1}>
                            {runtimeSubtitle}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Row 3: Primary Production | Secondary Production */}
                    <View style={styles.metricRow}>
                      {/* Tile 5: Primary Production */}
                      <View style={[styles.metricCard, styles.cardGreen]}>
                        <View style={[styles.metricIconBox, styles.iconBoxGreen]}>
                          <BarChart2 size={18} color="#16A34A" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Primary Production
                          </Text>
                          <Text style={[styles.metricValue, { color: "#16A34A" }]}>
                            {primaryQty !== null ? formatNum(primaryQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{primaryUnit}</Text>
                        </View>
                      </View>

                      {/* Tile 6: Secondary Production */}
                      <View style={[styles.metricCard, styles.cardGray]}>
                        <View style={[styles.metricIconBox, styles.iconBoxGray]}>
                          <BarChart2 size={18} color="#475569" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Secondary Production
                          </Text>
                          <Text style={[styles.metricValue, { color: "#475569" }]}>
                            {secondaryQty !== null ? formatNum(secondaryQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{secondaryUnit}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Row 4: Wastage | Machine Cost / unit */}
                    <View style={styles.metricRow}>
                      {/* Tile 7: Wastage */}
                      <View style={[styles.metricCard, styles.cardOrange]}>
                        <View style={[styles.metricIconBox, styles.iconBoxOrange]}>
                          <Coins size={18} color="#EA580C" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Wastage
                          </Text>
                          <Text style={[styles.metricValue, { color: "#EA580C" }]}>
                            {wastageQty !== null ? formatNum(wastageQty, 2) : "0.00"}
                          </Text>
                          <Text style={styles.metricUnit}>{primaryUnit}</Text>
                        </View>
                      </View>

                      {/* Tile 8: Machine Cost / unit */}
                      <View style={[styles.metricCard, styles.cardPink]}>
                        <View style={[styles.metricIconBox, styles.iconBoxPink]}>
                          <Coins size={18} color="#DB2777" />
                        </View>
                        <View style={styles.metricContent}>
                          <Text style={styles.metricLabel} numberOfLines={1}>
                            Machine Cost / {primaryUnit}
                          </Text>
                          <Text style={[styles.metricValue, { color: "#DB2777" }]}>
                            {costPerUnit !== null ? formatTargetCost(costPerUnit) : "—"}
                          </Text>
                          <Text style={styles.metricUnit}>/{primaryUnit}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Persistent Bottom Navigation Footer */}
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
  // Metrics Grid: 2 columns x 4 rows
  metricsGrid: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    minHeight: 110,
    justifyContent: "space-between",
  },
  // Color themes for the 8 cards
  cardGray: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  iconBoxGray: {
    backgroundColor: "#F1F5F9",
  },
  cardPurple: {
    backgroundColor: "#FAF5FF",
    borderColor: "#E9D5FF",
  },
  iconBoxPurple: {
    backgroundColor: "#EDE9FE",
  },
  cardBlue: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  iconBoxBlue: {
    backgroundColor: "#DBEAFE",
  },
  cardGreen: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  iconBoxGreen: {
    backgroundColor: "#DCFCE7",
  },
  cardOrange: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  iconBoxOrange: {
    backgroundColor: "#FFEDD5",
  },
  cardPink: {
    backgroundColor: "#FDF2F8",
    borderColor: "#FBCFE8",
  },
  iconBoxPink: {
    backgroundColor: "#FCE7F3",
  },
  metricIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  metricContent: {
    justifyContent: "flex-end",
  },
  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 15,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 22,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
});
