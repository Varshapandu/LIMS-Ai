// Utility for managing persistent billing data storage
import { emitBillEvent, emitPaymentEvent } from "./realtime-events";
import { safeParseJson } from "./storage-json";

export interface TestItem {
  test_code: string;
  test_name: string;
  service_category: string;
  quantity: number;
  price: number;
}

export interface StoredBill {
  invoice_number: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  patient_email?: string | null;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: "pending" | "partial" | "paid";
  barcodes: string[];
  tests: TestItem[];
  created_at: string;
  last_updated: string;
}

export interface BillingStorage {
  bills: StoredBill[];
  total_revenue: number;
  total_patients: number;
}

const STORAGE_KEY = "ai-lims-billing-data";

export function getDefaultBillingStorage(): BillingStorage {
  return {
    bills: [],
    total_revenue: 0,
    total_patients: 0,
  };
}

export function loadBillingData(): BillingStorage {
  if (typeof window === "undefined") {
    return getDefaultBillingStorage();
  }

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return safeParseJson<BillingStorage>(data, getDefaultBillingStorage());
  } catch {
    return getDefaultBillingStorage();
  }
}

export function saveBillToStorage(bill: StoredBill) {
  if (typeof window === "undefined") return;

  try {
    const storage = loadBillingData();

    // Check if bill already exists
    const existingIndex = storage.bills.findIndex((b) => b.invoice_number === bill.invoice_number);

    if (existingIndex >= 0) {
      // Update existing bill
      storage.bills[existingIndex] = bill;
    } else {
      // Add new bill
      storage.bills.push(bill);
    }

    // Recalculate totals
    storage.total_revenue = storage.bills.reduce((sum, b) => sum + b.paid_amount, 0);
    storage.total_patients = new Set(storage.bills.map((b) => b.patient_id)).size;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    
    // Dispatch real-time update event for dashboard
    emitBillEvent("created", bill as unknown as Record<string, unknown>);
    window.dispatchEvent(
      new CustomEvent("billing-data-updated", { detail: { storage, action: "bill-saved" } })
    );
  } catch (error) {
    console.error("Error saving bill to storage:", error);
  }
}

export function recordPaymentToStorage(invoiceNumber: string, paymentAmount: number) {
  if (typeof window === "undefined") return;

  try {
    const storage = loadBillingData();
    const bill = storage.bills.find((b) => b.invoice_number === invoiceNumber);

    if (bill) {
      bill.paid_amount += paymentAmount;
      bill.due_amount = Math.max(0, bill.net_amount - bill.paid_amount);
      bill.payment_status = bill.due_amount === 0 ? "paid" : bill.paid_amount > 0 ? "partial" : "pending";
      bill.last_updated = new Date().toISOString();

      // Recalculate totals
      storage.total_revenue = storage.bills.reduce((sum, b) => sum + b.paid_amount, 0);
      storage.total_patients = new Set(storage.bills.map((b) => b.patient_id)).size;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      
      // Dispatch real-time update event for dashboard
      emitPaymentEvent(invoiceNumber, paymentAmount);
      window.dispatchEvent(
        new CustomEvent("billing-data-updated", { detail: { storage, action: "payment-recorded" } })
      );
    }
  } catch (error) {
    console.error("Error recording payment:", error);
  }
}

export function deleteBillFromStorage(invoiceNumber: string) {
  if (typeof window === "undefined") return;

  try {
    const storage = loadBillingData();
    const nextBills = storage.bills.filter((bill) => bill.invoice_number !== invoiceNumber);

    storage.bills = nextBills;
    storage.total_revenue = nextBills.reduce((sum, bill) => sum + bill.paid_amount, 0);
    storage.total_patients = new Set(nextBills.map((bill) => bill.patient_id)).size;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    window.dispatchEvent(
      new CustomEvent("billing-data-updated", { detail: { storage, action: "bill-deleted", invoice_number: invoiceNumber } })
    );
  } catch (error) {
    console.error("Error deleting bill from storage:", error);
  }
}

export function calculateDashboardMetrics() {
  try {
    const storage = loadBillingData();

    const totalPatients = storage.total_patients;
    const totalRevenue = storage.total_revenue;
    const pendingTests = storage.bills.reduce((sum, bill) => sum + bill.barcodes.length, 0);
    const completedTests = 0; // Will be calculated from results

    // Calculate category distribution from tests
    const categoryMap = new Map<string, { count: number; total: number }>();
    
    storage.bills.forEach((bill) => {
      bill.tests.forEach((test) => {
        const category = test.service_category || "Other";
        if (!categoryMap.has(category)) {
          categoryMap.set(category, { count: 0, total: 0 });
        }
        const entry = categoryMap.get(category)!;
        entry.count += test.quantity;
        entry.total += test.quantity;
      });
    });

    const totalTests = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.total, 0);

    // Build category distribution array
    const categoryDistribution = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      percentage: totalTests > 0 ? ((data.count / totalTests) * 100).toFixed(2) : "0.00",
    }));

    return {
      total_patients: totalPatients,
      revenue: totalRevenue.toFixed(2),
      pending_tests: pendingTests,
      completed_tests: completedTests,
      critical_alerts: 0,
      today_visits: storage.bills.filter((b) => {
        const today = new Date().toDateString();
        const billDate = new Date(b.created_at).toDateString();
        return today === billDate;
      }).length,
      reported_visits: 0,
      category_distribution: categoryDistribution.slice(0, 3),
    };
  } catch (error) {
    console.error("Error calculating metrics:", error);
    return {
      total_patients: 0,
      revenue: "0.00",
      pending_tests: 0,
      completed_tests: 0,
      critical_alerts: 0,
      today_visits: 0,
      reported_visits: 0,
      category_distribution: [],
    };
  }
}

