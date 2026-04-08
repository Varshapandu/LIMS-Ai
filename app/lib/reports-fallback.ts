import { loadBillingData, type StoredBill } from "./billing-storage";
import { getAllLocalCatalogTests, getLocalCatalogTestByCodeOrName } from "./local-test-catalog";
import { loadWorkflowBundle } from "./workflow-storage";

type ReportsFilters = {
  dateRangeDays: number;
  department: string;
  testType: string;
};

type LocalAnalyticsRow = {
  visitNumber: string;
  patientId: string;
  patientName: string;
  sex: string;
  ageYears: number | null;
  createdAt: string;
  serviceCategory: string;
  departmentValue: string;
  departmentName: string;
  testCode: string;
  testName: string;
  sampleType: string;
  price: number;
  quantity: number;
  priority: string;
  resultStatus: string;
  criticalFlag: boolean;
  abnormalFlag: string | null;
  reportReady: boolean;
  reportGeneratedAt: string | null;
  turnaroundHours: number;
};

function normalizeDepartmentValue(departmentName: string) {
  return departmentName.trim().toLowerCase().replace(/\s+/g, "-");
}

function getDirection(current: number, previous: number, preferLower = false) {
  if (current === previous) {
    return "neutral";
  }
  if (preferLower) {
    return current <= previous ? "down" : "up";
  }
  return current >= previous ? "up" : "down";
}

function getPercentChange(current: number, previous: number) {
  if (!previous) {
    return "0.00";
  }
  return (((current - previous) / previous) * 100).toFixed(2);
}

function getAgeBand(ageYears: number | null) {
  if (ageYears === null || ageYears === undefined) return "Unknown";
  if (ageYears < 18) return "0-17";
  if (ageYears < 31) return "18-30";
  if (ageYears < 46) return "31-45";
  if (ageYears < 61) return "46-60";
  return "60+";
}

function buildDistribution(items: string[], ordered: string[]) {
  const total = items.length || 1;
  return ordered
    .map((label) => {
      const count = items.filter((item) => item === label).length;
      return {
        label,
        count,
        percentage: ((count / total) * 100).toFixed(2),
      };
    })
    .filter((item) => item.count > 0 || ["Male", "Female", "Normal", "Stat", "18-30", "31-45", "46-60"].includes(item.label));
}

function buildRowsFromBills(bills: StoredBill[], filters: ReportsFilters, includePreviousWindow = false) {
  const now = new Date();
  const rangeMs = filters.dateRangeDays * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - rangeMs);
  const previousStart = new Date(now.getTime() - rangeMs * 2);
  const workflow = loadWorkflowBundle();
  const workflowItems = workflow?.items || [];
  const workflowLookup = new Map(
    workflowItems.map((item) => [`${workflow?.visit_number || ""}::${item.test_code}`, item]),
  );
  const workflowReady = workflowItems.length > 0 && workflowItems.every((item) => item.result_status === "approved");

  const matchedBills = bills.filter((bill) => {
    const createdAt = new Date(bill.created_at);
    if (includePreviousWindow) {
      return createdAt >= previousStart && createdAt < currentStart;
    }
    return createdAt >= currentStart;
  });

  return matchedBills.flatMap((bill) =>
    (Array.isArray(bill.tests) ? bill.tests : []).flatMap((test) => {
      const catalog = getLocalCatalogTestByCodeOrName(test.test_code, test.test_name);
      const workflowItem = workflowLookup.get(`${bill.visit_number}::${test.test_code}`);
      const departmentName = workflowItem?.service_category === "radiology"
        ? "Radiology"
        : workflowItem?.service_category === "cardiology"
          ? "Cardiology"
          : catalog?.department_name || "Laboratory";
      const departmentValue = normalizeDepartmentValue(departmentName);
      const serviceCategory = workflowItem?.service_category || test.service_category || catalog?.service_category || "laboratory";
      const turnaroundHours = ((catalog?.turnaround_minutes || 240) / 60);
      const row: LocalAnalyticsRow = {
        visitNumber: bill.visit_number,
        patientId: bill.patient_id,
        patientName: bill.patient_name,
        sex: workflow?.patient.patient_id === bill.patient_id ? (workflow?.patient.sex || "unknown") : "unknown",
        ageYears: workflow?.patient.patient_id === bill.patient_id ? (workflow?.patient.age_years ?? null) : null,
        createdAt: bill.created_at,
        serviceCategory,
        departmentValue,
        departmentName,
        testCode: test.test_code,
        testName: test.test_name,
        sampleType: workflowItem?.sample_type || catalog?.sample_type || "Sample",
        price: test.price,
        quantity: Math.max(1, test.quantity || 1),
        priority: workflowItem?.priority || "normal",
        resultStatus: workflowItem?.result_status || "pending",
        criticalFlag: Boolean(workflowItem?.critical_flag),
        abnormalFlag: workflowItem?.abnormal_flag || null,
        reportReady: workflowReady && workflow?.visit_number === bill.visit_number,
        reportGeneratedAt: workflowReady && workflow?.visit_number === bill.visit_number ? workflow?.updated_at || workflow?.created_at || bill.last_updated : null,
        turnaroundHours,
      };

      if (filters.department !== "all" && row.departmentValue !== filters.department) {
        return [];
      }
      if (filters.testType !== "all" && row.serviceCategory !== filters.testType) {
        return [];
      }
      return [row];
    }),
  );
}

export function hasMeaningfulAnalytics(data: {
  metric_cards?: Array<{ value: string | number }>;
  department_performance?: unknown[];
  top_tests?: unknown[];
  recent_reports?: unknown[];
}) {
  const cardValue = data.metric_cards?.some((card) => Number(card.value || 0) > 0);
  return Boolean(cardValue || data.department_performance?.length || data.top_tests?.length || data.recent_reports?.length);
}

export function buildLocalReportsAnalytics(filters: ReportsFilters) {
  const billing = loadBillingData();
  const safeBills = (Array.isArray(billing.bills) ? billing.bills : []).map((bill) => ({
    ...bill,
    tests: Array.isArray(bill.tests) ? bill.tests : [],
  }));
  const currentRows = buildRowsFromBills(safeBills, filters, false);
  const previousRows = buildRowsFromBills(safeBills, filters, true);
  const now = new Date();

  const catalogRows = getAllLocalCatalogTests();
  const departments = Array.from(
    new Set(
      catalogRows.map((item) => normalizeDepartmentValue(item.department_name || "Laboratory")),
    ),
  ).sort();

  const departmentOptions = [
    { label: "All Departments", value: "all" },
    ...departments.map((value) => ({
      value,
      label: value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    })),
  ];

  const testTypes = Array.from(
    new Set(catalogRows.map((item) => item.service_category || "laboratory")),
  ).sort();
  const testTypeOptions = [
    { label: "All Test Types", value: "all" },
    ...testTypes.map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value })),
  ];

  const samplesProcessed = currentRows.reduce((sum, row) => sum + row.quantity, 0);
  const previousSamplesProcessed = previousRows.reduce((sum, row) => sum + row.quantity, 0);
  const avgTat = currentRows.length ? currentRows.reduce((sum, row) => sum + row.turnaroundHours, 0) / currentRows.length : 0;
  const previousAvgTat = previousRows.length ? previousRows.reduce((sum, row) => sum + row.turnaroundHours, 0) / previousRows.length : 0;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const revenueMtd = safeBills
    .filter((bill) => new Date(bill.created_at) >= monthStart)
    .reduce((sum, bill) => sum + bill.net_amount, 0);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMonthStart = monthStart;
  const previousRevenueMtd = safeBills
    .filter((bill) => {
      const created = new Date(bill.created_at);
      return created >= previousMonthStart && created < currentMonthStart;
    })
    .reduce((sum, bill) => sum + bill.net_amount, 0);

  const reruns = currentRows.filter((row) => row.resultStatus === "amended").length;
  const previousReruns = previousRows.filter((row) => row.resultStatus === "amended").length;

  const metric_cards = [
    {
      label: "Samples Processed",
      value: samplesProcessed,
      change_percent: getPercentChange(samplesProcessed, previousSamplesProcessed),
      change_direction: getDirection(samplesProcessed, previousSamplesProcessed),
      footnote: `${currentRows.filter((row) => row.resultStatus === "approved").length} approved in local workflow`,
      accent: "teal",
    },
    {
      label: "Average TAT",
      value: avgTat.toFixed(2),
      change_percent: getPercentChange(avgTat, previousAvgTat),
      change_direction: getDirection(avgTat, previousAvgTat, true),
      footnote: "Estimated from configured turnaround targets",
      accent: "navy",
    },
    {
      label: "Revenue MTD",
      value: revenueMtd.toFixed(2),
      change_percent: getPercentChange(revenueMtd, previousRevenueMtd),
      change_direction: getDirection(revenueMtd, previousRevenueMtd),
        footnote: `${safeBills.filter((bill) => new Date(bill.created_at) >= monthStart).length} billed visits this month`,
      accent: "teal",
    },
    {
      label: "Rerun Rate",
      value: samplesProcessed ? ((reruns / samplesProcessed) * 100).toFixed(2) : "0.00",
      change_percent: getPercentChange(reruns, previousReruns),
      change_direction: getDirection(reruns, previousReruns, true),
      footnote: `${reruns} amended results in local data`,
      accent: "red",
    },
  ];

  const departmentMap = new Map<string, { department_code: string; department_name: string; actual: number; count: number; previous: number }>();
  currentRows.forEach((row) => {
    const existing = departmentMap.get(row.departmentValue) || {
      department_code: row.departmentName.slice(0, 3).toUpperCase(),
      department_name: row.departmentName,
      actual: 0,
      count: 0,
      previous: 0,
    };
    existing.actual += row.price * row.quantity;
    existing.count += row.quantity;
    departmentMap.set(row.departmentValue, existing);
  });
  previousRows.forEach((row) => {
    const existing = departmentMap.get(row.departmentValue) || {
      department_code: row.departmentName.slice(0, 3).toUpperCase(),
      department_name: row.departmentName,
      actual: 0,
      count: 0,
      previous: 0,
    };
    existing.previous += row.price * row.quantity;
    departmentMap.set(row.departmentValue, existing);
  });

  const department_performance = Array.from(departmentMap.values())
    .map((item) => ({
      department_code: item.department_code,
      department_name: item.department_name,
      actual_revenue: item.actual.toFixed(2),
      target_revenue: (item.previous > 0 ? item.previous * 1.08 : item.actual * 1.1).toFixed(2),
      growth_percent: getPercentChange(item.actual, item.previous),
      sample_count: item.count,
    }))
    .sort((left, right) => Number(right.actual_revenue) - Number(left.actual_revenue));

  const bottlenecks = [
    {
      stage: "Accessioning",
      backlog_count: currentRows.filter((row) => row.resultStatus === "pending").length,
      throughput_percent: samplesProcessed ? (100 - (currentRows.filter((row) => row.resultStatus === "pending").length / samplesProcessed) * 100).toFixed(2) : "100.00",
      status: currentRows.some((row) => row.resultStatus === "pending") ? "Warning" : "Normal",
      tone: currentRows.some((row) => row.resultStatus === "pending") ? "warning" : "normal",
      note: "Billing exists, but these tests have not fully progressed through local result capture yet.",
    },
    {
      stage: "Analytical Run",
      backlog_count: currentRows.filter((row) => row.resultStatus === "entered").length,
      throughput_percent: samplesProcessed ? (100 - (currentRows.filter((row) => row.resultStatus === "entered").length / samplesProcessed) * 100).toFixed(2) : "100.00",
      status: currentRows.some((row) => row.resultStatus === "entered") ? "Warning" : "Normal",
      tone: currentRows.some((row) => row.resultStatus === "entered") ? "warning" : "normal",
      note: "Results have been entered locally and are awaiting final sign-off.",
    },
    {
      stage: "Clinical Validation",
      backlog_count: currentRows.filter((row) => row.resultStatus === "verified").length,
      throughput_percent: samplesProcessed ? (100 - (currentRows.filter((row) => row.resultStatus === "verified").length / samplesProcessed) * 100).toFixed(2) : "100.00",
      status: currentRows.some((row) => row.resultStatus === "verified") ? "Warning" : "Normal",
      tone: currentRows.some((row) => row.resultStatus === "verified") ? "warning" : "normal",
      note: "Verified cases are pending doctor approval before final reporting.",
    },
    {
      stage: "Final Reporting",
      backlog_count: currentRows.filter((row) => row.resultStatus === "approved" && !row.reportReady).length,
      throughput_percent: samplesProcessed ? (100 - (currentRows.filter((row) => row.resultStatus === "approved" && !row.reportReady).length / samplesProcessed) * 100).toFixed(2) : "100.00",
      status: currentRows.some((row) => row.resultStatus === "approved" && !row.reportReady) ? "Warning" : "Normal",
      tone: currentRows.some((row) => row.resultStatus === "approved" && !row.reportReady) ? "warning" : "normal",
      note: "Approved local results are ready to be packaged into a final issued report view.",
    },
  ];

  const gender_distribution = buildDistribution(
    currentRows.map((row) => row.sex ? row.sex.charAt(0).toUpperCase() + row.sex.slice(1) : "Unknown"),
    ["Male", "Female", "Other", "Unknown"],
  );
  const age_distribution = buildDistribution(currentRows.map((row) => getAgeBand(row.ageYears)), ["0-17", "18-30", "31-45", "46-60", "60+", "Unknown"]);
  const priority_distribution = buildDistribution(currentRows.map((row) => row.priority.charAt(0).toUpperCase() + row.priority.slice(1)), ["Normal", "Stat"]);

  const testMap = new Map<string, {
    test_code: string;
    test_name: string;
    department_name: string;
    sample_type: string;
    monthly_volume: number;
    revenue: number;
    turnaroundHours: number[];
    abnormalCount: number;
  }>();
  currentRows.forEach((row) => {
    const key = `${row.testCode}::${row.departmentName}`;
    const existing = testMap.get(key) || {
      test_code: row.testCode,
      test_name: row.testName,
      department_name: row.departmentName,
      sample_type: row.sampleType,
      monthly_volume: 0,
      revenue: 0,
      turnaroundHours: [],
      abnormalCount: 0,
    };
    existing.monthly_volume += row.quantity;
    existing.revenue += row.price * row.quantity;
    existing.turnaroundHours.push(row.turnaroundHours);
    if (row.abnormalFlag || row.criticalFlag) {
      existing.abnormalCount += row.quantity;
    }
    testMap.set(key, existing);
  });

  const top_tests = Array.from(testMap.values())
    .map((item) => {
      const avgTat = item.turnaroundHours.reduce((sum, value) => sum + value, 0) / (item.turnaroundHours.length || 1);
      const abnormalRate = item.monthly_volume ? (item.abnormalCount / item.monthly_volume) * 100 : 0;
      let efficiency_status = "Optimal";
      let efficiency_tone = "good";
      if (avgTat > 8) {
        efficiency_status = "Backlogged";
        efficiency_tone = "critical";
      } else if (avgTat > 5) {
        efficiency_status = "Monitor";
        efficiency_tone = "warning";
      }
      return {
        test_code: item.test_code,
        test_name: item.test_name,
        department_name: item.department_name,
        sample_type: item.sample_type,
        monthly_volume: item.monthly_volume,
        avg_revenue_per_test: (item.revenue / (item.monthly_volume || 1)).toFixed(2),
        avg_tat_hours: avgTat.toFixed(2),
        abnormal_rate: abnormalRate.toFixed(2),
        efficiency_status,
        efficiency_tone,
      };
    })
    .sort((left, right) => right.monthly_volume - left.monthly_volume)
    .slice(0, 8);

  const recent_reports = safeBills
    .filter((bill) => {
      const matchingRows = currentRows.filter((row) => row.visitNumber === bill.visit_number);
      return matchingRows.some((row) => row.reportReady || row.resultStatus === "approved");
    })
    .map((bill) => {
      const matchingRows = currentRows.filter((row) => row.visitNumber === bill.visit_number);
      const firstRow = matchingRows[0];
      return {
        report_number: `LOCAL-${bill.visit_number}`,
        visit_number: bill.visit_number,
        patient_name: bill.patient_name,
        department_name: firstRow?.departmentName || "Laboratory",
        report_status: matchingRows.every((row) => row.reportReady) ? "issued" : "ready",
        generated_at: matchingRows[0]?.reportGeneratedAt || bill.last_updated,
        item_count: matchingRows.reduce((sum, row) => sum + row.quantity, 0),
      };
    })
    .sort((left, right) => new Date(right.generated_at || 0).getTime() - new Date(left.generated_at || 0).getTime())
    .slice(0, 8);

  const strategic_notes = [
    samplesProcessed > 0 ? `${samplesProcessed} test rows are available from local billing and workflow storage for this cohort.` : "",
    top_tests[0] ? `${top_tests[0].test_name} is currently the highest-volume locally persisted test.` : "",
    recent_reports[0] ? `${recent_reports.length} visit${recent_reports.length === 1 ? "" : "s"} are ready for report-focused review in local mode.` : "",
    safeBills.length > 0 ? `${safeBills.length} billed visit${safeBills.length === 1 ? "" : "s"} have been detected from browser persistence.` : "",
  ].filter(Boolean);

  return {
    generated_at: new Date().toISOString(),
    date_range_days: filters.dateRangeDays,
    selected_department: filters.department,
    selected_test_type: filters.testType,
    available_departments: departmentOptions,
    available_test_types: testTypeOptions,
    metric_cards,
    department_performance,
    bottlenecks,
    gender_distribution,
    age_distribution,
    priority_distribution,
    top_tests,
    recent_reports,
    strategic_notes,
  };
}
