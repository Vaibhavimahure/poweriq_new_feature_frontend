/**
 * ProductLogsScreen.tsx
 * ----------------------------------------------------------------------------
 * Displays historical production logs for the selected product.
 * Features:
 *   - List of production logs with shift, quantities, wastage, and SEC
 *   - Pull-to-refresh
 *   - Prominent "+ Add Production Log" button
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Plus,
  Calendar,
  Clock,
  Factory,
  Trash2,
  Zap,
  BarChart2,
  FileText,
} from "lucide-react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../../types/navigation";
import { fetchProductLogsFromBackend } from "../../api/secCommunicationApi";
import { CONFIG } from "../../config/constants";
import { CardSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../components/common/ErrorCard";
import { AppHeader } from "../../components/common/AppHeader";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "ProductLogs">;
type ScreenRouteProp = RouteProp<RootStackParamList, "ProductLogs">;

export const ProductLogsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();

  const { productId, productName, unit = "MT", secondaryUnit = "MT" } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (!productId) return;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const data = await fetchProductLogsFromBackend(productId, { limit: 50 });
      const rawLogs =
        data?.rows ||
        data?.data?.rows ||
        data?.history ||
        data?.logs ||
        (Array.isArray(data) ? data : []);
      setLogs(rawLogs);
    } catch (err: any) {
      console.warn("[ProductLogsScreen] Error loading logs:", err);
      setError(err?.message || "Failed to load production logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [productId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // When returning from AddProductionLogScreen, reload list
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadLogs(true);
    });
    return unsubscribe;
  }, [navigation, loadLogs]);

  const handleAddLog = () => {
    navigation.navigate("AddProductionLog", {
      productId,
      productName,
      unit,
      secondaryUnit,
    });
  };

  const renderLogItem = ({ item }: { item: any }) => {
    const dateStr = item.productionDate || item.date || item.createdAt?.substring(0, 10) || "—";
    const shift = item.shiftName || item.shift || "Morning Shift";
    const primaryQty = item.primaryProductionQty ?? item.primaryQty ?? item.qtyProduced ?? 0;
    const secondaryQty = item.secondaryProductionQty ?? item.secondaryQty ?? 0;
    const wastageQty = item.wastageQty ?? item.waste ?? 0;
    const sec = item.sec ?? item.secPerProductionUnit ?? null;
    const energy = item.totalEnergy ?? item.energy ?? null;
    const remarks = item.remarks;

    return (
      <View style={styles.logCard}>
        {/* Top Header: Date & Shift */}
        <View style={styles.logCardHeader}>
          <View style={styles.dateBadge}>
            <Calendar size={13} color="#2563EB" />
            <Text style={styles.dateBadgeText}>{dateStr}</Text>
          </View>
          <View style={styles.shiftBadge}>
            <Clock size={13} color="#D97706" />
            <Text style={styles.shiftBadgeText}>{shift}</Text>
          </View>
        </View>

        {/* Quantities Grid */}
        <View style={styles.quantitiesGrid}>
          {/* Primary Qty */}
          <View style={styles.quantityBox}>
            <View style={styles.quantityLabelRow}>
              <Factory size={13} color="#2563EB" />
              <Text style={styles.quantityLabel}>Primary</Text>
            </View>
            <Text style={styles.quantityValue}>
              {Number(primaryQty).toLocaleString()} <Text style={styles.quantityUnit}>{unit}</Text>
            </Text>
          </View>

          {/* Secondary Qty */}
          <View style={styles.quantityBox}>
            <View style={styles.quantityLabelRow}>
              <Factory size={13} color="#16A34A" />
              <Text style={styles.quantityLabel}>Secondary</Text>
            </View>
            <Text style={styles.quantityValue}>
              {Number(secondaryQty).toLocaleString()} <Text style={styles.quantityUnit}>{secondaryUnit}</Text>
            </Text>
          </View>

          {/* Wastage Qty */}
          <View style={styles.quantityBox}>
            <View style={styles.quantityLabelRow}>
              <Trash2 size={13} color="#DC2626" />
              <Text style={styles.quantityLabel}>Wastage</Text>
            </View>
            <Text style={[styles.quantityValue, { color: "#DC2626" }]}>
              {Number(wastageQty).toLocaleString()} <Text style={styles.quantityUnit}>{unit}</Text>
            </Text>
          </View>
        </View>

        {/* Calculated SEC & Energy footer if present */}
        {(sec !== null || energy !== null) && (
          <View style={styles.metricFooter}>
            {energy !== null && (
              <View style={styles.footerMetric}>
                <Zap size={12} color="#D97706" />
                <Text style={styles.footerMetricText}>
                  Energy: <Text style={styles.footerMetricBold}>{Number(energy).toFixed(1)} kWh</Text>
                </Text>
              </View>
            )}
            {sec !== null && (
              <View style={styles.footerMetric}>
                <BarChart2 size={12} color="#7C3AED" />
                <Text style={styles.footerMetricText}>
                  SEC: <Text style={styles.footerMetricBold}>{Number(sec).toFixed(3)} kWh/{unit}</Text>
                </Text>
              </View>
            )}
          </View>
        )}

        {remarks ? (
          <View style={styles.remarksRow}>
            <FileText size={12} color="#64748B" />
            <Text style={styles.remarksText} numberOfLines={2}>
              {remarks}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* App Header */}
      <AppHeader title="Production Logs" />

      {/* Content Area */}
      {loading && !refreshing ? (
        <View style={styles.skeletonContainer}>
          <CardSkeleton height={110} />
          <CardSkeleton height={110} />
          <CardSkeleton height={110} />
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <ErrorCard title="Error Loading Logs" message={error} onRetry={() => loadLogs(true)} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item, index) => item._id || item.id || `log-${index}`}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLogs(true)}
              colors={[CONFIG.THEME.primary]}
              tintColor={CONFIG.THEME.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <FileText size={32} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No Production Logs Yet</Text>
              <Text style={styles.emptySubtitle}>
                Add shift production logs for {productName || "this product"} to track quantities, wastage, and SEC.
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={handleAddLog}
                activeOpacity={0.85}
              >
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Add First Production Log</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Floating Bottom Action Bar */}
      {logs.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <TouchableOpacity
            style={styles.fullAddBtn}
            onPress={handleAddLog}
            activeOpacity={0.88}
          >
            <Plus size={20} color="#FFFFFF" />
            <Text style={styles.fullAddBtnText}>+ Add Production Log</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  appBarTitleCol: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  appBarSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  headerAddBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  skeletonContainer: {
    padding: 16,
    gap: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  logCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  dateBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  shiftBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  shiftBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
  },
  quantitiesGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  quantityBox: {
    flex: 1,
  },
  quantityLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  quantityLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  quantityValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  quantityUnit: {
    fontSize: 11,
    fontWeight: "400",
    color: "#64748B",
  },
  metricFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  footerMetric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerMetricText: {
    fontSize: 12,
    color: "#64748B",
  },
  footerMetricBold: {
    fontWeight: "600",
    color: "#1E293B",
  },
  remarksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  remarksText: {
    fontSize: 11,
    color: "#475569",
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  emptyAddBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fullAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  fullAddBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
