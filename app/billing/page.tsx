"use client";

import "./billing.css";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "../components/app-shell";
import { ExportIcon } from "../components/icons";
import { apiRequest, API_BASE_URL } from "../lib/api";
import { searchLocalCatalog } from "../lib/local-test-catalog";
import { saveBillToStorage, recordPaymentToStorage, deleteBillFromStorage, StoredBill, loadBillingData } from "../lib/billing-storage";
import { downloadBlob } from "../lib/browser-file";
import { addNotification } from "../lib/notifications-storage";
import { useAuthRedirect } from "../lib/use-auth-redirect";
import { saveWorkflowBundle, type WorkflowBundle, type WorkflowItem } from "../lib/workflow-storage";

type CatalogTestItem = {
  id: string;
  test_code: string;
  test_name: string;
  service_category: string;
  sample_type: string;
  container_type: string;
  department_name: string;
  price: string;
  turnaround_minutes: number;
};

type CreatedPatient = {
  id: string;
  patient_code: string;
  full_name: string;
  email?: string | null;
  mobile_number?: string | null;
};

type InvoiceResponse = {
  invoice_number: string;
  visit_number: string;
  order_number: string;
  gross_amount: string;
  discount_amount: string;
  net_amount: string;
  barcodes: string[];
};

type InvoiceSummary = {
  invoice_number: string;
  visit_number: string;
  patient_name: string;
  gross_amount: string;
  discount_amount: string;
  net_amount: string;
  paid_amount: string;
  due_amount: string;
  payment_status: string;
};

type PaymentResponse = {
  payment_reference: string;
  paid_amount: string;
  due_amount: string;
  payment_status: string;
};

type SelectedTest = CatalogTestItem & {
  quantity: number;
  priority: "normal" | "stat" | "urgent";
};

type LocalCollectionItem = {
  specimen_id: string;
  specimen_number: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  test_code: string;
  test_name: string;
  sample_type: string;
  container_type: string;
  barcode_value: string;
  specimen_status: string;
  priority?: string | null;
  rejection_reason?: string | null;
  tat_due_at?: string | null;
};

const initialPatient = {
  first_name: "",
  last_name: "",
  sex: "female",
  age_years: "",
  mobile_number: "",
  email: "",
};

function formatCategory(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sanitizeMobileNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 15);
}

function sanitizeEmailInput(value: string) {
  return value.replace(/[\s'"`’‘]+/g, "").toLowerCase();
}

function isBackendUnavailableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("load failed") ||
    normalized.includes("fetch") ||
    normalized.includes("timeout")
  );
}

function buildLocalVisitArtifacts(patientName: string, selectedTests: SelectedTest[], discountValue: number) {
  const seed = Date.now().toString().slice(-6);
  const visitNumber = `VIS-LOCAL-${seed}`;
  const invoiceNumber = `INV-LOCAL-${seed}`;
  const orderNumber = `ORD-LOCAL-${seed}`;
  const grossAmount = selectedTests.reduce((sum, test) => sum + Number(test.price) * test.quantity, 0);
  const netAmount = Math.max(0, grossAmount - discountValue);

  const collectionItems: LocalCollectionItem[] = [];
  const barcodes: string[] = [];

  selectedTests.forEach((test, index) => {
    Array.from({ length: test.quantity }, (_, quantityIndex) => {
      const barcode = `${test.test_code}-${seed}-${index + 1}${quantityIndex + 1}`;
      barcodes.push(barcode);
      collectionItems.push({
        specimen_id: `SPM-LOCAL-${seed}-${index + 1}-${quantityIndex + 1}`,
        specimen_number: `SPM-LOCAL-${seed}-${index + 1}${quantityIndex + 1}`,
        visit_number: visitNumber,
        patient_id: `PAT-LOCAL-${seed}`,
        patient_name: patientName,
        test_code: test.test_code,
        test_name: test.test_name,
        sample_type: test.sample_type,
        container_type: test.container_type,
        barcode_value: barcode,
        specimen_status: "pending",
        priority: test.priority,
        rejection_reason: null,
        tat_due_at: null,
      });
    });
  });

  return {
    invoice: {
      invoice_number: invoiceNumber,
      visit_number: visitNumber,
      order_number: orderNumber,
      gross_amount: String(grossAmount),
      discount_amount: String(discountValue),
      net_amount: String(netAmount),
      barcodes,
    },
    summary: {
      invoice_number: invoiceNumber,
      visit_number: visitNumber,
      patient_name: patientName,
      gross_amount: String(grossAmount),
      discount_amount: String(discountValue),
      net_amount: String(netAmount),
      paid_amount: "0",
      due_amount: String(netAmount),
      payment_status: "pending",
    },
    collectionBundle: {
      visit_number: visitNumber,
      patient_name: patientName,
      items: collectionItems,
    },
  };
}

function buildWorkflowItems(
  selectedTests: SelectedTest[],
  visitNumber: string,
  patientId: string,
  patientName: string,
  barcodes: string[],
  patientDetails: {
    sex?: string | null;
    age_years?: number | null;
    mobile_number?: string | null;
    email?: string | null;
  },
): WorkflowItem[] {
  let barcodeIndex = 0;

  return selectedTests.flatMap((test, index) =>
    Array.from({ length: test.quantity }, (_, quantityIndex) => {
      const barcodeValue = barcodes[barcodeIndex] || `${test.test_code}-${index + 1}-${quantityIndex + 1}`;
      barcodeIndex += 1;

      return {
        order_test_id: `${visitNumber}-${test.test_code}-${quantityIndex + 1}`,
        specimen_id: `SPM-${visitNumber}-${index + 1}-${quantityIndex + 1}`,
        specimen_number: `SPM-${visitNumber}-${index + 1}${quantityIndex + 1}`,
        visit_number: visitNumber,
        patient_id: patientId,
        patient_name: patientName,
        sex: patientDetails.sex ?? null,
        age_years: patientDetails.age_years ?? null,
        mobile_number: patientDetails.mobile_number ?? null,
        email: patientDetails.email ?? null,
        test_code: test.test_code,
        test_name: test.test_name,
        sample_type: test.sample_type,
        container_type: test.container_type,
        barcode_value: barcodeValue,
        specimen_status: "pending",
        rejection_reason: null,
        tat_due_at: null,
        service_category: test.service_category,
        method_name: null,
        unit: null,
        reference_range_text: null,
        priority: test.priority,
        result_status: "pending",
        result_text: null,
        numeric_value: null,
        abnormal_flag: null,
        critical_flag: false,
      };
    }),
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [patientForm, setPatientForm] = useState(initialPatient);
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<CatalogTestItem[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [statusMessage, setStatusMessage] = useState("Start by registering a patient and selecting tests.");
  const [submitting, setSubmitting] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<CreatedPatient | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [updatingPatientEmail, setUpdatingPatientEmail] = useState(false);
  const [generatedBills, setGeneratedBills] = useState<StoredBill[]>([]);
  const invoiceRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const isAuthenticated = useAuthRedirect();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Load initial bills
    const storage = loadBillingData();
    setGeneratedBills(storage.bills);
    
    // Listen for real-time bill updates
    const handleBillingUpdate = () => {
      const updated = loadBillingData();
      setGeneratedBills(updated.bills);
    };
    
    window.addEventListener("billing-data-updated", handleBillingUpdate);
    
    // Handle notification click to scroll
    const handleNotificationClick = (event: Event) => {
      const customEvent = event as CustomEvent;
      const invoiceNum = customEvent.detail?.invoiceNumber;
      if (invoiceNum && invoiceRefsMap.current.has(invoiceNum)) {
        const element = invoiceRefsMap.current.get(invoiceNum);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.style.boxShadow = "0 0 0 3px #11c2c8";
          setTimeout(() => {
            element.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
          }, 2000);
        }
      }
    };
    
    window.addEventListener("scroll-to-invoice", handleNotificationClick);
    
    return () => {
      window.removeEventListener("billing-data-updated", handleBillingUpdate);
      window.removeEventListener("scroll-to-invoice", handleNotificationClick);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const trimmedQuery = testQuery.trim();
    const controller = new AbortController();

    if (!trimmedQuery) {
      setTestResults([]);
      setLoadingTests(false);
      return () => controller.abort();
    }

    setLoadingTests(true);
    const timeoutId = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/catalog/tests?query=${encodeURIComponent(trimmedQuery)}&limit=12`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Catalog request failed");
          }
          return response.json();
        })
        .then((data: CatalogTestItem[]) => {
          if (data.length > 0) {
            setTestResults(data);
            return;
          }
          setTestResults(searchLocalCatalog(trimmedQuery, 12));
        })
        .catch(() => setTestResults(searchLocalCatalog(trimmedQuery, 12)))
        .finally(() => setLoadingTests(false));
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [testQuery]);

  const showTestDropdown = testQuery.trim().length > 0;

  const grossAmount = useMemo(() => {
    return selectedTests.reduce((sum, test) => sum + Number(test.price) * test.quantity, 0);
  }, [selectedTests]);

  const netAmount = Math.max(0, grossAmount - Number(discountAmount || 0));

  function addTest(test: CatalogTestItem) {
    setSelectedTests((current) => {
      const found = current.find((item) => item.test_code === test.test_code);
      if (found) {
        return current.map((item) => item.test_code === test.test_code ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...test, quantity: 1, priority: "normal" }];
    });
    setTestQuery("");
    setTestResults([]);
  }

  function updateQuantity(testCode: string, nextQuantity: number) {
    setSelectedTests((current) => current.map((item) => item.test_code === testCode ? { ...item, quantity: Math.max(1, nextQuantity) } : item));
  }

  function removeTest(testCode: string) {
    setSelectedTests((current) => current.filter((item) => item.test_code !== testCode));
  }

  function updatePriority(testCode: string, nextPriority: SelectedTest["priority"]) {
    setSelectedTests((current) => current.map((item) => item.test_code === testCode ? { ...item, priority: nextPriority } : item));
  }

  async function handleGenerateBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTests.length === 0) {
      setStatusMessage("Add at least one test before generating the bill.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("Creating patient, visit, invoice, and barcodes...");

    const patientName = [patientForm.first_name, patientForm.last_name].filter(Boolean).join(" ") || "Walk In Patient";
    const discountValue = Number(discountAmount || 0);

    try {
      const createdPatient = await apiRequest<CreatedPatient>("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          ...patientForm,
          age_years: patientForm.age_years ? Number(patientForm.age_years) : null,
          email: patientForm.email || null,
        }),
      });

      const createdInvoice = await apiRequest<InvoiceResponse>("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patient_id: createdPatient.id,
          discount_amount: discountValue,
          lines: selectedTests.map((test) => ({
            test_code: test.test_code,
            quantity: test.quantity,
            price: Number(test.price),
            priority: test.priority,
          })),
        }),
      });

      const summary = await apiRequest<InvoiceSummary>(`/api/billing/invoices/${createdInvoice.invoice_number}`);
      const workflowBundle: WorkflowBundle = {
        visit_number: createdInvoice.visit_number,
        patient: {
          patient_id: createdPatient.id,
          patient_name: createdPatient.full_name,
          sex: patientForm.sex,
          age_years: patientForm.age_years ? Number(patientForm.age_years) : null,
          mobile_number: patientForm.mobile_number || null,
          email: createdPatient.email || patientForm.email || null,
        },
        clinical_notes: null,
        diagnosis: null,
        medication: null,
        items: buildWorkflowItems(
          selectedTests,
          createdInvoice.visit_number,
          createdPatient.id,
          createdPatient.full_name,
          createdInvoice.barcodes,
          {
            sex: patientForm.sex,
            age_years: patientForm.age_years ? Number(patientForm.age_years) : null,
            mobile_number: patientForm.mobile_number || null,
            email: createdPatient.email || patientForm.email || null,
          },
        ),
      };
      saveWorkflowBundle(workflowBundle);
      setCurrentPatient({
        ...createdPatient,
        mobile_number: patientForm.mobile_number || null,
      });
      setRegisteredEmail(createdPatient.email || patientForm.email || "");
      setInvoice(createdInvoice);
      setInvoiceSummary(summary);
      setPaymentAmount(String(summary.due_amount));
      setStatusMessage(`Bill generated successfully. Review the visit details and record payments below, then proceed to specimen collection.`);
      
      // Add notification
      addNotification(
        `Invoice ${createdInvoice.invoice_number} generated for ${createdPatient.full_name}. Amount: Rs ${Number(summary.net_amount).toLocaleString("en-IN")}`,
        "success",
        undefined,
        createdInvoice.invoice_number
      );
      
      // Save to persistent storage
      const storedBill: StoredBill = {
        invoice_number: createdInvoice.invoice_number,
        visit_number: createdInvoice.visit_number,
        patient_id: createdPatient.id,
        patient_name: createdPatient.full_name,
        patient_email: createdPatient.email || patientForm.email || null,
        gross_amount: Number(createdInvoice.gross_amount),
        discount_amount: Number(createdInvoice.discount_amount),
        net_amount: Number(createdInvoice.net_amount),
        paid_amount: 0,
        due_amount: Number(createdInvoice.net_amount),
        payment_status: "pending",
        barcodes: createdInvoice.barcodes,
        tests: selectedTests.map((test) => ({
          test_code: test.test_code,
          test_name: test.test_name,
          service_category: test.service_category,
          quantity: test.quantity,
          price: Number(test.price),
        })),
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
      saveBillToStorage(storedBill);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate bill.";
      if (!isBackendUnavailableError(message)) {
        setStatusMessage(message);
        setSubmitting(false);
        return;
      }

      const localArtifacts = buildLocalVisitArtifacts(patientName, selectedTests, discountValue);
      setInvoice(localArtifacts.invoice);
      setInvoiceSummary(localArtifacts.summary);
      setPaymentAmount(localArtifacts.summary.due_amount);
      saveWorkflowBundle({
        visit_number: localArtifacts.collectionBundle.visit_number,
        patient: {
          patient_id: localArtifacts.collectionBundle.items[0]?.patient_id || `PAT-${localArtifacts.collectionBundle.visit_number}`,
          patient_name: patientName,
          sex: patientForm.sex,
          age_years: patientForm.age_years ? Number(patientForm.age_years) : null,
          mobile_number: patientForm.mobile_number || null,
          email: patientForm.email || null,
        },
        clinical_notes: null,
        diagnosis: null,
        medication: null,
        items: buildWorkflowItems(
          selectedTests,
          localArtifacts.collectionBundle.visit_number,
          localArtifacts.collectionBundle.items[0]?.patient_id || `PAT-${localArtifacts.collectionBundle.visit_number}`,
          patientName,
          localArtifacts.invoice.barcodes,
          {
            sex: patientForm.sex,
            age_years: patientForm.age_years ? Number(patientForm.age_years) : null,
            mobile_number: patientForm.mobile_number || null,
            email: patientForm.email || null,
          },
        ),
      });
      setCurrentPatient({
        id: localArtifacts.collectionBundle.items[0]?.patient_id || `PAT-${localArtifacts.collectionBundle.visit_number}`,
        patient_code: localArtifacts.collectionBundle.items[0]?.patient_id || `PAT-${localArtifacts.collectionBundle.visit_number}`,
        full_name: patientName,
        email: patientForm.email || null,
        mobile_number: patientForm.mobile_number || null,
      });
      setRegisteredEmail(patientForm.email || "");
      setStatusMessage(`Backend unavailable. Generated local demo visit ${localArtifacts.invoice.visit_number}. Review details and payments below, then proceed to collection.`);
      
      // Add notification
      addNotification(
        `Local demo invoice ${localArtifacts.invoice.invoice_number} generated for ${patientName}. Amount: Rs ${Number(localArtifacts.summary.net_amount).toLocaleString("en-IN")}`,
        "info",
        undefined,
        localArtifacts.invoice.invoice_number
      );
      
      // Save to persistent storage
      const storedBill: StoredBill = {
        invoice_number: localArtifacts.invoice.invoice_number,
        visit_number: localArtifacts.invoice.visit_number,
        patient_id: `PAT-LOCAL-${Date.now()}`,
        patient_name: patientName,
        patient_email: patientForm.email || null,
        gross_amount: Number(localArtifacts.invoice.gross_amount),
        discount_amount: Number(localArtifacts.invoice.discount_amount),
        net_amount: Number(localArtifacts.invoice.net_amount),
        paid_amount: 0,
        due_amount: Number(localArtifacts.invoice.net_amount),
        payment_status: "pending",
        barcodes: localArtifacts.invoice.barcodes,
        tests: selectedTests.map((test) => ({
          test_code: test.test_code,
          test_name: test.test_name,
          service_category: test.service_category,
          quantity: test.quantity,
          price: Number(test.price),
        })),
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
      saveBillToStorage(storedBill);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayment() {
    if (!invoice || !invoiceSummary) {
      return;
    }

    try {
      const amount = Number(paymentAmount || 0);
      const payment = await apiRequest<PaymentResponse>("/api/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          invoice_number: invoice.invoice_number,
          amount: amount,
          payment_mode: paymentMode,
        }),
      });
      const summary = await apiRequest<InvoiceSummary>(`/api/billing/invoices/${invoice.invoice_number}`);
      setInvoiceSummary(summary);
      setPaymentAmount("0");
      setStatusMessage(`Payment recorded with reference ${payment.payment_reference}. Remaining due: Rs ${Number(payment.due_amount).toLocaleString("en-IN")}.`);
      
      // Add notification
      addNotification(
        `Payment of Rs ${Number(amount).toLocaleString("en-IN")} recorded for invoice ${invoice.invoice_number}. Reference: ${payment.payment_reference}`,
        "success",
        undefined,
        invoice.invoice_number
      );
      
      // Save to persistent storage
      recordPaymentToStorage(invoice.invoice_number, amount);
    } catch {
      if (invoiceSummary) {
        const amount = Number(paymentAmount || 0);
        const paidAmount = Number(invoiceSummary.paid_amount) + amount;
        const dueAmount = Math.max(0, Number(invoiceSummary.net_amount) - paidAmount);
        const nextSummary = {
          ...invoiceSummary,
          paid_amount: String(paidAmount),
          due_amount: String(dueAmount),
          payment_status: dueAmount === 0 ? "paid" : "partial",
        };
        setInvoiceSummary(nextSummary);
        setPaymentAmount("0");
        setStatusMessage(`Payment saved locally in demo mode. Remaining due: Rs ${dueAmount.toLocaleString("en-IN")}.`);
        
        // Add notification
        addNotification(
          `Payment of Rs ${amount.toLocaleString("en-IN")} recorded for invoice ${invoice.invoice_number} (Demo Mode)`,
          "success",
          undefined,
          invoice.invoice_number
        );
        
        // Save to persistent storage
        recordPaymentToStorage(invoice.invoice_number, amount);
      }
    }
  }

  function handleExportBillingData() {
    if (!invoice || !invoiceSummary) {
      setStatusMessage("Generate a bill first before exporting data.");
      return;
    }
    const exportData = {
      invoice: invoice,
      summary: invoiceSummary,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    downloadBlob(blob, `billing-${invoice.invoice_number}.json`);
    setStatusMessage(`Billing data for ${invoice.invoice_number} exported successfully.`);
  }

  async function handleUpdatePatientEmail() {
    if (!currentPatient?.id) {
      setStatusMessage("Create a patient first before updating the registered email.");
      return;
    }
    if (currentPatient.id.startsWith("PAT-LOCAL-")) {
      setStatusMessage("Local demo patients cannot be updated on the backend.");
      return;
    }

    setUpdatingPatientEmail(true);
    try {
      const updatedPatient = await apiRequest<CreatedPatient>(`/api/patients/${currentPatient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          mobile_number: currentPatient.mobile_number || patientForm.mobile_number || null,
          email: registeredEmail.trim() || null,
        }),
      });
      setCurrentPatient(updatedPatient);
      setRegisteredEmail(updatedPatient.email || "");
      setPatientForm((current) => ({ ...current, email: updatedPatient.email || "" }));
      if (invoice && invoiceSummary) {
        saveBillToStorage({
          invoice_number: invoice.invoice_number,
          visit_number: invoice.visit_number,
          patient_id: currentPatient.id,
          patient_name: invoiceSummary.patient_name,
          patient_email: updatedPatient.email || null,
          gross_amount: Number(invoice.gross_amount),
          discount_amount: Number(invoice.discount_amount),
          net_amount: Number(invoice.net_amount),
          paid_amount: Number(invoiceSummary.paid_amount),
          due_amount: Number(invoiceSummary.due_amount),
          payment_status: invoiceSummary.payment_status as StoredBill["payment_status"],
          barcodes: invoice.barcodes,
          tests: generatedBills.find((bill) => bill.invoice_number === invoice.invoice_number)?.tests || [],
          created_at: generatedBills.find((bill) => bill.invoice_number === invoice.invoice_number)?.created_at || new Date().toISOString(),
          last_updated: new Date().toISOString(),
        });
      }
      setStatusMessage(`Registered patient email updated to ${updatedPatient.email || "blank"}. Finalized reports will use this address.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update patient email.");
    } finally {
      setUpdatingPatientEmail(false);
    }
  }

  function handleDeleteBill(invoiceNumber: string) {
    deleteBillFromStorage(invoiceNumber);
    setGeneratedBills((current) => current.filter((bill) => bill.invoice_number !== invoiceNumber));

    if (invoice?.invoice_number === invoiceNumber) {
      setInvoice(null);
      setInvoiceSummary(null);
      setCurrentPatient(null);
      setRegisteredEmail("");
      setPaymentAmount("0");
    }

    setStatusMessage(`Deleted invoice ${invoiceNumber} from the generated invoices list.`);
  }

  return (
    <AppShell
      overline="Billing Workflow"
      title="Patient Registration & Billing"
      action={
        <button className="export-button" type="button" onClick={handleExportBillingData} disabled={!invoice}>
          <ExportIcon className="export-icon" />
          <span>Billing Console</span>
        </button>
      }
    >
      <section className="billing-grid">
        <form className="panel billing-panel" onSubmit={handleGenerateBill}>
          <div className="panel-title-row">
            <div>
              <div className="panel-title">Patient Intake</div>
              <div className="panel-copy">Register patient identity, add services, apply discount, and generate the visit bill.</div>
            </div>
            <div className="status-pill">Unified Catalog</div>
          </div>

          <div className="billing-form-grid">
            <div className="field"><label className="label">First Name</label><input className="input" value={patientForm.first_name} onChange={(event) => setPatientForm({ ...patientForm, first_name: event.target.value })} required /></div>
            <div className="field"><label className="label">Last Name</label><input className="input" value={patientForm.last_name} onChange={(event) => setPatientForm({ ...patientForm, last_name: event.target.value })} /></div>
            <div className="field"><label className="label">Sex</label><select className="input" value={patientForm.sex} onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
            <div className="field"><label className="label">Age</label><input className="input" type="number" min="0" value={patientForm.age_years} onChange={(event) => setPatientForm({ ...patientForm, age_years: event.target.value })} /></div>
            <div className="field"><label className="label">Mobile Number</label><input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={15} value={patientForm.mobile_number} onChange={(event) => setPatientForm({ ...patientForm, mobile_number: sanitizeMobileNumber(event.target.value) })} placeholder="Digits only" /></div>
            <div className="field"><label className="label">Patient Email</label><input className="input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={patientForm.email} onChange={(event) => setPatientForm({ ...patientForm, email: sanitizeEmailInput(event.target.value) })} placeholder="patient@example.com" /></div>
          </div>

          <div className="field search-field-block">
            <label className="label">Add Services</label>
            <input className="input" placeholder="Type MRI, CT, X-Ray, ECG, Glucose, CBC..." value={testQuery} onChange={(event) => setTestQuery(event.target.value)} />
            {showTestDropdown ? (
              <div className="search-results-panel">
                {loadingTests ? <div className="search-empty-state">Loading matching services...</div> : null}
                {!loadingTests && testResults.length > 0 ? (
                  testResults.map((test) => (
                    <button className="search-result-item" type="button" key={test.id} onClick={() => addTest(test)}>
                      <div>
                        <strong>{test.test_name}</strong>
                        <span>{test.test_code} • {test.department_name} • {formatCategory(test.service_category)}</span>
                      </div>
                      <span>Rs {Number(test.price).toLocaleString("en-IN")}</span>
                    </button>
                  ))
                ) : null}
                {!loadingTests && testResults.length === 0 ? <div className="search-empty-state">No services found for this search yet.</div> : null}
              </div>
            ) : null}
          </div>

          <div className="selected-tests">
            {selectedTests.length > 0 ? selectedTests.map((test) => (
              <div className="selected-test-row" key={test.test_code}>
                <div>
                  <div className="selected-test-name">{test.test_name}</div>
                  <div className="selected-test-meta">{formatCategory(test.service_category)} • {test.department_name} • {test.test_code}</div>
                </div>
                <div className="selected-test-controls">
                  <select className="priority-input" value={test.priority} onChange={(event) => updatePriority(test.test_code, event.target.value as SelectedTest["priority"])} aria-label={`Priority for ${test.test_name}`}>
                    <option value="normal">Normal</option>
                    <option value="stat">STAT</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <input className="qty-input" type="number" min="1" value={test.quantity} onChange={(event) => updateQuantity(test.test_code, Number(event.target.value || 1))} />
                  <div className="selected-test-price">Rs {(Number(test.price) * test.quantity).toLocaleString("en-IN")}</div>
                  <button className="remove-link" type="button" onClick={() => removeTest(test.test_code)}>Remove</button>
                </div>
              </div>
            )) : <div className="empty-state">No services selected yet. Search above to add investigations.</div>}
          </div>

          <div className="totals-card">
            <div className="field"><label className="label">Discount</label><input className="input" type="number" min="0" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></div>
            <div className="totals-lines">
              <div className="total-line"><span>Gross Amount</span><strong>Rs {grossAmount.toLocaleString("en-IN")}</strong></div>
              <div className="total-line"><span>Net Amount</span><strong>Rs {netAmount.toLocaleString("en-IN")}</strong></div>
            </div>
            <button className="primary-btn" type="submit" disabled={submitting}>{submitting ? "Generating Bill..." : "Generate Bill"}</button>
            <div className="billing-note">{statusMessage}</div>
          </div>
        </form>

        <div className="billing-side-column">
          <section className="panel billing-summary-card">
            <div className="panel-title">Generated Visit</div>
            <div className="panel-copy">The invoice, visit, order, and barcode stack will appear here after submission.</div>
            {invoice && invoiceSummary ? (
              <div className="summary-stack">
                <div className="summary-block"><span>Patient</span><strong>{invoiceSummary.patient_name}</strong></div>
                <div className="summary-block"><span>Visit Number</span><strong>{invoice.visit_number}</strong></div>
                <div className="summary-block"><span>Invoice Number</span><strong>{invoice.invoice_number}</strong></div>
                <div className="summary-block"><span>Order Number</span><strong>{invoice.order_number}</strong></div>
                <div className="summary-block"><span>Payment Status</span><strong>{invoiceSummary.payment_status}</strong></div>
                <div className="summary-block"><span>Due Amount</span><strong>Rs {Number(invoiceSummary.due_amount).toLocaleString("en-IN")}</strong></div>
                <div className="summary-block"><span>Registered Email</span><strong>{currentPatient?.email || "Not saved"}</strong></div>
                <div className="field">
                  <label className="label">Update Registered Email</label>
                  <input
                    className="input"
                    type="email"
                    value={registeredEmail}
                    onChange={(event) => setRegisteredEmail(sanitizeEmailInput(event.target.value))}
                    placeholder="patient@example.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <button className="secondary-btn" type="button" onClick={() => void handleUpdatePatientEmail()} disabled={updatingPatientEmail || !currentPatient}>
                  {updatingPatientEmail ? "Saving Email..." : "Save Patient Email"}
                </button>
                <div className="barcode-stack">
                  {invoice.barcodes.map((barcode) => (
                    <button
                      key={barcode}
                      className="barcode-chip"
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(barcode);
                        setStatusMessage(`Copied barcode: ${barcode}`);
                      }}
                      title="Click to copy barcode"
                    >
                      {barcode}
                    </button>
                  ))}
                </div>
                <button 
                  className="primary-btn" 
                  type="button" 
                  onClick={() => {
                    if (invoiceSummary && Number(invoiceSummary.due_amount) > 0) {
                      addNotification(
                        `⚠️ Proceeding with unpaid amount: Rs ${Number(invoiceSummary.due_amount).toLocaleString("en-IN")} still due for invoice ${invoice.invoice_number}. Complete payment before billing cycle closure.`,
                        "warning",
                        undefined,
                        invoice.invoice_number
                      );
                    }
                    router.push(`/collection?visit=${encodeURIComponent(invoice.visit_number)}`);
                  }}
                >
                  Proceed to Collection
                </button>
              </div>
            ) : <div className="empty-state compact">Generate a bill to see the live visit artifacts.</div>}
          </section>

          <section className="panel billing-summary-card">
            <div className="panel-title">Payment Capture</div>
            <div className="panel-copy">Post payment directly against the generated invoice.</div>
            <div className="field"><label className="label">Amount</label><input className="input" type="number" min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} disabled={!invoice} /></div>
            <div className="field"><label className="label">Mode</label><select className="input" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} disabled={!invoice}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank</option></select></div>
            <button className="secondary-btn" type="button" disabled={!invoice} onClick={() => { setStatusMessage("Processing payment..."); handlePayment(); }}>Record Payment</button>
          </section>

          <section className="panel">
            <div className="panel-title">Generated Invoices</div>
            <div className="panel-copy">All bills generated in this session. Click notification to navigate here.</div>
            {generatedBills.length === 0 ? (
              <div className="empty-state">No invoices generated yet. Create a bill above to see them here.</div>
            ) : (
              <div className="invoices-list">
                {generatedBills.map((bill) => (
                  <div
                    key={bill.invoice_number}
                    ref={(el) => {
                      if (el) invoiceRefsMap.current.set(bill.invoice_number, el);
                    }}
                    className={`invoice-item ${bill.payment_status}`}
                  >
                    <div className="invoice-header">
                      <div><strong>{bill.invoice_number}</strong> | {bill.patient_name}</div>
                      <span className={`status-badge ${bill.payment_status}`}>{bill.payment_status.toUpperCase()}</span>
                    </div>
                    <div className="invoice-details">
                      <div><span className="label">Visit:</span> {bill.visit_number}</div>
                      <div><span className="label">Amount:</span> Rs {bill.net_amount.toLocaleString("en-IN")}</div>
                      <div><span className="label">Paid:</span> Rs {bill.paid_amount.toLocaleString("en-IN")}</div>
                      <div><span className="label">Due:</span> <strong>Rs {bill.due_amount.toLocaleString("en-IN")}</strong></div>
                    </div>
                    <div className="invoice-actions">
                      {bill.due_amount > 0 && (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => {
                            setInvoice({
                              invoice_number: bill.invoice_number,
                              visit_number: bill.visit_number,
                              order_number: "",
                              gross_amount: String(bill.gross_amount),
                              discount_amount: String(bill.discount_amount),
                              net_amount: String(bill.net_amount),
                              barcodes: bill.barcodes,
                            });
                            setInvoiceSummary({
                              invoice_number: bill.invoice_number,
                              visit_number: bill.visit_number,
                              patient_name: bill.patient_name,
                              gross_amount: String(bill.gross_amount),
                              discount_amount: String(bill.discount_amount),
                              net_amount: String(bill.net_amount),
                              paid_amount: String(bill.paid_amount),
                              due_amount: String(bill.due_amount),
                              payment_status: bill.payment_status,
                            });
                            setCurrentPatient({
                              id: bill.patient_id,
                              patient_code: bill.patient_id,
                              full_name: bill.patient_name,
                              email: bill.patient_email || null,
                            });
                            setRegisteredEmail(bill.patient_email || "");
                            setPaymentAmount(String(bill.due_amount));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Pay Now
                        </button>
                      )}
                      <button
                        className="small-btn small-btn-delete"
                          type="button"
                        onClick={() => handleDeleteBill(bill.invoice_number)}
                      >
                        Delete
                      </button>
                      <span className="invoice-date">{new Date(bill.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </AppShell>
  );
}
