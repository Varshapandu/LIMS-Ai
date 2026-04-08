"use client";

import { addNotification } from "./notifications-storage";
import { loadBillingData, saveBillToStorage, type StoredBill, type TestItem } from "./billing-storage";
import { getLocalCatalogTestByCodeOrName } from "./local-test-catalog";
import { deriveAbnormalFlag } from "./report-flags";
import { buildLocalReportsAnalytics } from "./reports-fallback";
import { loadWorkflowBundle, saveWorkflowBundle, type WorkflowBundle, type WorkflowItem } from "./workflow-storage";

type ChatAgentResponse = {
  content: string;
};

type UserContext = {
  name?: string;
  role?: string;
};

const DOMAIN_KEYWORDS = [
  "bill",
  "billing",
  "invoice",
  "payment",
  "due",
  "workflow",
  "status",
  "specimen",
  "sample",
  "collect",
  "collection",
  "result",
  "report",
  "analytics",
  "dashboard",
  "critical",
  "abnormal",
  "retest",
  "reenter",
  "physician",
  "doctor",
  "visit",
  "patient",
  "test",
  "barcode",
  "approval",
  "approve",
  "lab",
  "lims",
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.%/\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function isDomainQuestion(query: string) {
  return DOMAIN_KEYWORDS.some((keyword) => query.includes(keyword));
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function getBundle() {
  return loadWorkflowBundle();
}

function getBills() {
  return loadBillingData().bills;
}

function getCurrentBill(bundle: WorkflowBundle | null, bills: StoredBill[]) {
  if (!bundle) {
    return bills[0] || null;
  }
  return bills.find((bill) => bill.visit_number === bundle.visit_number) || bills[0] || null;
}

function parseNumericBounds(referenceRangeText?: string | null) {
  if (!referenceRangeText) {
    return null;
  }

  const match = referenceRangeText.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return null;
  }

  return { low, high };
}

function computeCriticalFlag(value: string, referenceRangeText?: string | null) {
  const bounds = parseNumericBounds(referenceRangeText);
  const numericValue = Number(value);
  if (bounds && Number.isFinite(numericValue)) {
    return numericValue < bounds.low * 0.5 || numericValue > bounds.high * 1.5;
  }

  const normalizedValue = normalize(value);
  return ["positive", "reactive", "detected", "growth", "present"].some((term) => normalizedValue.includes(term));
}

function findMatchingItems(query: string, bundle: WorkflowBundle | null) {
  if (!bundle) {
    return [];
  }

  const normalizedQuery = normalize(query);
  return bundle.items.filter((item) => {
    const candidates = [
      item.visit_number,
      item.barcode_value,
      item.order_test_id || "",
      item.test_code,
      item.test_name,
      item.patient_name,
      item.sample_type,
    ];
    return candidates.some((candidate) => {
      const normalizedCandidate = normalize(candidate);
      return normalizedCandidate && normalizedQuery.includes(normalizedCandidate);
    });
  });
}

function getBestTargets(query: string, bundle: WorkflowBundle | null) {
  const matched = findMatchingItems(query, bundle);
  if (matched.length > 0) {
    return matched;
  }
  return bundle?.items || [];
}

function summarizeWorkflow(bundle: WorkflowBundle | null, bills: StoredBill[]) {
  if (!bundle) {
    if (bills.length === 0) {
      return "No live billing or workflow data is loaded yet. Generate a bill first, then I can track collection, values, approvals, and reports.";
    }

    const outstanding = bills.filter((bill) => bill.due_amount > 0);
    const totalDue = outstanding.reduce((sum, bill) => sum + bill.due_amount, 0);
    return `There are ${bills.length} billed visits in local storage. ${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} still have dues totaling ${formatCurrency(totalDue)}.`;
  }

  const items = bundle.items;
  const pendingSpecimens = items.filter((item) => !["received", "collected"].includes((item.specimen_status || "").toLowerCase())).length;
  const entered = items.filter((item) => item.result_status === "entered").length;
  const approved = items.filter((item) => item.result_status === "approved").length;
  const critical = items.filter((item) => item.critical_flag).length;
  const abnormal = items.filter((item) => item.abnormal_flag || item.critical_flag).length;
  const bill = bills.find((entry) => entry.visit_number === bundle.visit_number);

  const lines = [
    `Active visit: ${bundle.visit_number} for ${bundle.patient.patient_name}.`,
    `${items.length} workflow item${items.length === 1 ? "" : "s"} loaded: ${pendingSpecimens} awaiting specimen, ${entered} entered, ${approved} approved.`,
    `${abnormal} abnormal item${abnormal === 1 ? "" : "s"} detected, including ${critical} critical alert${critical === 1 ? "" : "s"}.`,
  ];

  if (bill) {
    lines.push(`Billing: invoice ${bill.invoice_number}, payment status ${bill.payment_status}, due ${formatCurrency(bill.due_amount)}.`);
  }

  return lines.join("\n");
}

function answerBilling(bundle: WorkflowBundle | null, bills: StoredBill[]) {
  const bill = getCurrentBill(bundle, bills);
  if (!bill) {
    return "No invoice is available yet. Generate a bill first and I can answer dues, paid amount, tests billed, and visit-level charges.";
  }

  const tests = bill.tests.map((item) => `${item.test_name} x${item.quantity}`).slice(0, 6).join(", ");
  return [
    `Invoice ${bill.invoice_number} for visit ${bill.visit_number}.`,
    `Patient: ${bill.patient_name}. Net ${formatCurrency(bill.net_amount)}, paid ${formatCurrency(bill.paid_amount)}, due ${formatCurrency(bill.due_amount)}.`,
    `Payment status: ${bill.payment_status}.`,
    tests ? `Billed tests: ${tests}.` : "",
  ].filter(Boolean).join("\n");
}

function answerHighValues(bundle: WorkflowBundle | null) {
  if (!bundle) {
    return "No result data is loaded yet, so I can't inspect high or critical values.";
  }

  const flagged = bundle.items.filter((item) => item.critical_flag || item.abnormal_flag);
  if (flagged.length === 0) {
    return `No abnormal or critical values are flagged for visit ${bundle.visit_number} right now.`;
  }

  return [
    `Flagged values for visit ${bundle.visit_number}:`,
    ...flagged.slice(0, 8).map((item) => {
      const value = item.numeric_value ?? item.result_text ?? "pending";
      const flag = item.critical_flag ? "critical" : item.abnormal_flag?.toLowerCase() || "abnormal";
      return `- ${item.test_name}: ${value} (${flag})`;
    }),
  ].join("\n");
}

function answerReports() {
  const analytics = buildLocalReportsAnalytics({ dateRangeDays: 30, department: "all", testType: "all" });
  const topTest = analytics.top_tests[0];
  const recent = analytics.recent_reports[0];
  const cards = analytics.metric_cards.map((card) => `${card.label}: ${card.value}`).join(", ");

  return [
    "Local reports analytics summary:",
    cards || "No analytics cards available yet.",
    topTest ? `Highest volume test: ${topTest.test_name} (${topTest.monthly_volume} tests, abnormal rate ${topTest.abnormal_rate}%).` : "No top-test analytics available yet.",
    recent ? `Latest report-ready visit: ${recent.visit_number} for ${recent.patient_name} (${recent.report_status}).` : "No report-ready visits are available yet.",
  ].join("\n");
}

function extractValue(query: string) {
  const match = query.match(/\b(?:to|as|=)\s*([a-z0-9.+\-/% ]+)$/i);
  return match?.[1]?.trim() || "";
}

function createRetestWorkflowItem(item: WorkflowItem) {
  const stamp = Date.now().toString().slice(-6);
  const barcode = `${item.test_code}-RT-${stamp}`;
  return {
    ...item,
    order_test_id: `${item.visit_number}-${item.test_code}-RT-${stamp}`,
    specimen_id: `${item.specimen_id}-RT-${stamp}`,
    specimen_number: `${item.specimen_number}-RT-${stamp}`,
    barcode_value: barcode,
    specimen_status: "pending",
    rejection_reason: null,
    result_status: "pending",
    result_text: null,
    numeric_value: null,
    abnormal_flag: null,
    critical_flag: false,
  };
}

function actionRetest(query: string, user: UserContext): ChatAgentResponse {
  const bundle = getBundle();
  const bills = getBills();
  if (!bundle) {
    return { content: "I need an active visit in workflow storage before I can route a retest." };
  }

  const target = getBestTargets(query, bundle)[0];
  if (!target) {
    return { content: `I couldn't find the requested test in visit ${bundle.visit_number}. Mention the test name, code, or barcode.` };
  }

  const retestItem = createRetestWorkflowItem(target);
  saveWorkflowBundle({
    ...bundle,
    items: [...bundle.items, retestItem],
  });

  const currentBill = bills.find((bill) => bill.visit_number === bundle.visit_number);
  if (currentBill) {
    const catalog = getLocalCatalogTestByCodeOrName(target.test_code, target.test_name);
    const price = Number(catalog?.price || currentBill.tests.find((entry) => entry.test_code === target.test_code)?.price || 0);
    const existing = currentBill.tests.find((entry) => entry.test_code === target.test_code && entry.test_name === target.test_name);
    const nextTests: TestItem[] = existing
      ? currentBill.tests.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry)
      : [...currentBill.tests, {
          test_code: target.test_code,
          test_name: target.test_name,
          service_category: target.service_category || "laboratory",
          quantity: 1,
          price,
        }];

    saveBillToStorage({
      ...currentBill,
      tests: nextTests,
      gross_amount: currentBill.gross_amount + price,
      net_amount: currentBill.net_amount + price,
      due_amount: currentBill.due_amount + price,
      payment_status: currentBill.paid_amount >= currentBill.net_amount + price ? "paid" : currentBill.paid_amount > 0 ? "partial" : "pending",
      barcodes: [...currentBill.barcodes, retestItem.barcode_value],
      last_updated: new Date().toISOString(),
    });
  }

  addNotification(
    `Retest added for ${target.test_name} on visit ${bundle.visit_number}. Billing has been updated and the specimen is back in collection queue.`,
    "warning",
  );

  return {
    content: [
      `Retest created for ${target.test_name}.`,
      `New barcode: ${retestItem.barcode_value}.`,
      "I added the test back into billing, reset the workflow for a fresh specimen, and sent a notification so the process can start again.",
      user.role ? `Action recorded for role: ${user.role}.` : "",
    ].filter(Boolean).join("\n"),
  };
}

function actionCollect(query: string): ChatAgentResponse {
  const bundle = getBundle();
  if (!bundle) {
    return { content: "No active workflow bundle is loaded, so I can't mark specimen collection yet." };
  }

  const targets = getBestTargets(query, bundle).filter((item) => !["received", "collected"].includes((item.specimen_status || "").toLowerCase()));
  if (targets.length === 0) {
    return { content: `All matched specimens are already collected for visit ${bundle.visit_number}.` };
  }

  const barcodes = new Set(targets.map((item) => item.barcode_value));
  saveWorkflowBundle({
    ...bundle,
    items: bundle.items.map((item) => barcodes.has(item.barcode_value) ? { ...item, specimen_status: "received", rejection_reason: null } : item),
  });

  addNotification(
    `${targets.length} specimen${targets.length === 1 ? "" : "s"} marked collected for visit ${bundle.visit_number}.`,
    "success",
  );

  return {
    content: [
      `${targets.length} specimen${targets.length === 1 ? "" : "s"} marked collected.`,
      ...targets.slice(0, 5).map((item) => `- ${item.test_name} (${item.barcode_value})`),
    ].join("\n"),
  };
}

function actionEnterResult(query: string): ChatAgentResponse {
  const bundle = getBundle();
  if (!bundle) {
    return { content: "I need an active result-entry workflow before I can save a value." };
  }

  const value = extractValue(query);
  if (!value) {
    return { content: "Tell me the target test and the value, for example: `enter glucose fasting as 118`." };
  }

  const target = getBestTargets(query.replace(value, ""), bundle)[0];
  if (!target) {
    return { content: `I couldn't match that result to a test in visit ${bundle.visit_number}. Mention the test code, name, or barcode.` };
  }

  const abnormalFlag = deriveAbnormalFlag({
    numericValue: Number.isFinite(Number(value)) ? value : null,
    resultText: Number.isFinite(Number(value)) ? null : value,
    referenceRangeText: target.reference_range_text || null,
  });
  const criticalFlag = computeCriticalFlag(value, target.reference_range_text || null);

  saveWorkflowBundle({
    ...bundle,
    items: bundle.items.map((item) =>
      item.barcode_value === target.barcode_value
        ? {
            ...item,
            result_status: "entered",
            numeric_value: Number.isFinite(Number(value)) ? Number(value) : null,
            result_text: Number.isFinite(Number(value)) ? null : value,
            abnormal_flag: abnormalFlag,
            critical_flag: criticalFlag,
          }
        : item,
    ),
  });

  if (criticalFlag) {
    addNotification(
      `Critical value captured for ${target.test_name} on visit ${bundle.visit_number}. Immediate physician attention is recommended.`,
      "error",
    );
  }

  return {
    content: [
      `Result saved for ${target.test_name}.`,
      `Value: ${value}. Status is now entered${abnormalFlag ? ` with flag ${abnormalFlag.toLowerCase()}` : ""}${criticalFlag ? " and marked critical" : ""}.`,
    ].join("\n"),
  };
}

function actionRequestReentry(query: string): ChatAgentResponse {
  const bundle = getBundle();
  if (!bundle) {
    return { content: "No active workflow case is loaded, so I can't raise a re-entry alert yet." };
  }

  const target = getBestTargets(query, bundle)[0];
  const label = target ? `${target.test_name} (${bundle.visit_number})` : `visit ${bundle.visit_number}`;
  addNotification(
    `Physician re-entry confirmation requested for ${label}. Please re-enter the reported value to confirm before approval.`,
    "warning",
  );

  return {
    content: `A physician alert has been created asking for value re-entry confirmation for ${label}.`,
  };
}

function answerSpecificTest(query: string, bundle: WorkflowBundle | null) {
  if (!bundle) {
    return null;
  }

  const target = findMatchingItems(query, bundle)[0];
  if (!target) {
    return null;
  }

  const value = target.numeric_value ?? target.result_text ?? "pending";
  return [
    `${target.test_name} in visit ${target.visit_number}.`,
    `Specimen: ${target.specimen_status}. Result: ${target.result_status}.`,
    `Current value: ${value}.`,
    target.reference_range_text ? `Reference range: ${target.reference_range_text}.` : "",
    target.abnormal_flag || target.critical_flag ? `Flag: ${target.critical_flag ? "critical" : target.abnormal_flag}.` : "No abnormal flag on this item right now.",
  ].filter(Boolean).join("\n");
}

export function processChatbotMessage(query: string, user: UserContext = {}): ChatAgentResponse {
  const normalizedQuery = normalize(query);
  const bundle = getBundle();
  const bills = getBills();

  if (!normalizedQuery) {
    return { content: "Ask me about workflow, report values, billing dues, retests, specimen collection, or result entry." };
  }

  if (["hi", "hello", "hey", "help", "menu", "start"].includes(normalizedQuery)) {
    return {
      content: [
        "I can help with LIMS tasks like billing, workflow, specimen collection, results, and reports.",
        "Use the guided buttons for structured questions, or type a direct instruction like `collect specimen for CBC`.",
      ].join("\n"),
    };
  }

  if (normalizedQuery.includes("retest")) {
    return actionRetest(query, user);
  }

  if (
    normalizedQuery.includes("collect specimen") ||
    normalizedQuery.includes("mark collected") ||
    normalizedQuery.includes("receive specimen") ||
    normalizedQuery.includes("collect sample")
  ) {
    return actionCollect(query);
  }

  if (
    (normalizedQuery.includes("enter value") || normalizedQuery.includes("enter result") || normalizedQuery.includes("set result") || normalizedQuery.includes("update result")) &&
    /\b(?:to|as|=)\b/i.test(query)
  ) {
    return actionEnterResult(query);
  }

  if (normalizedQuery.includes("reenter") || normalizedQuery.includes("re enter") || normalizedQuery.includes("confirm value")) {
    return actionRequestReentry(query);
  }

  if (normalizedQuery.includes("bill") || normalizedQuery.includes("invoice") || normalizedQuery.includes("payment") || normalizedQuery.includes("due")) {
    return { content: answerBilling(bundle, bills) };
  }

  if (normalizedQuery.includes("report") || normalizedQuery.includes("analytics") || normalizedQuery.includes("dashboard")) {
    return { content: answerReports() };
  }

  if (normalizedQuery.includes("high value") || normalizedQuery.includes("critical") || normalizedQuery.includes("abnormal") || normalizedQuery.includes("report value")) {
    return { content: answerHighValues(bundle) };
  }

  const specificAnswer = answerSpecificTest(query, bundle);
  if (specificAnswer) {
    return { content: specificAnswer };
  }

  if (normalizedQuery.includes("workflow") || normalizedQuery.includes("status") || normalizedQuery.includes("pending") || normalizedQuery.includes("next")) {
    return { content: summarizeWorkflow(bundle, bills) };
  }

  if (!isDomainQuestion(normalizedQuery)) {
    return {
      content: [
        "I am currently limited to LIMS-related help only.",
        "I can answer questions about billing, payment details, workflow status, specimen collection, result entry, retests, and reports.",
        "For the best experience, use the guided buttons below or ask a domain question like `show billing details`.",
      ].join("\n"),
    };
  }

  return {
    content: [
      summarizeWorkflow(bundle, bills),
      "",
      "I can also perform actions for you.",
      "- `request retest for glucose fasting`",
      "- `collect specimen for CBC`",
      "- `enter result for glucose fasting as 126`",
      "- `notify physician to reenter sodium value`",
    ].join("\n"),
  };
}
