"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "../components/app-shell";
import { apiRequest } from "../lib/api";
import { useAuthRedirect } from "../lib/use-auth-redirect";

type ReferenceRangeItem = {
  id: string;
  test_id: string;
  test_code: string;
  test_name: string;
  service_category: string;
  sex?: string | null;
  min_age_years?: number | null;
  max_age_years?: number | null;
  unit?: string | null;
  reference_range_text?: string | null;
  method_name?: string | null;
  critical_low?: string | number | null;
  critical_high?: string | number | null;
  is_default: boolean;
  updated_at: string;
};

type CatalogItem = {
  id: string;
  test_code: string;
  test_name: string;
  service_category: string;
  sample_type: string;
  container_type: string;
  department_name: string;
  price: string;
  turnaround_minutes: number;
  unit?: string | null;
  reference_range_text?: string | null;
};

type FormState = {
  id?: string;
  test_id: string;
  test_label: string;
  sex: string;
  min_age_years: string;
  max_age_years: string;
  unit: string;
  reference_range_text: string;
  method_name: string;
  critical_low: string;
  critical_high: string;
  is_default: boolean;
};

const emptyForm: FormState = {
  test_id: "",
  test_label: "",
  sex: "",
  min_age_years: "",
  max_age_years: "",
  unit: "",
  reference_range_text: "",
  method_name: "",
  critical_low: "",
  critical_high: "",
  is_default: false,
};

function toFormState(item?: ReferenceRangeItem | null): FormState {
  if (!item) {
    return emptyForm;
  }

  return {
    id: item.id,
    test_id: item.test_id,
    test_label: `${item.test_name} (${item.test_code})`,
    sex: item.sex || "",
    min_age_years: item.min_age_years !== null && item.min_age_years !== undefined ? String(item.min_age_years) : "",
    max_age_years: item.max_age_years !== null && item.max_age_years !== undefined ? String(item.max_age_years) : "",
    unit: item.unit || "",
    reference_range_text: item.reference_range_text || "",
    method_name: item.method_name || "",
    critical_low: item.critical_low !== null && item.critical_low !== undefined ? String(item.critical_low) : "",
    critical_high: item.critical_high !== null && item.critical_high !== undefined ? String(item.critical_high) : "",
    is_default: item.is_default,
  };
}

export default function ReferenceRangesPage() {
  const [ranges, setRanges] = useState<ReferenceRangeItem[]>([]);
  const [search, setSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading reference ranges...");

  const isAuthenticated = useAuthRedirect();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadRanges();
  }, [isAuthenticated]);

  useEffect(() => {
    const trimmed = catalogSearch.trim();
    if (trimmed.length < 1) {
      setCatalogOptions([]);
      return;
    }

    const timeout = setTimeout(() => {
      void loadCatalog(trimmed);
    }, 180);

    return () => clearTimeout(timeout);
  }, [catalogSearch]);

  async function loadRanges() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (serviceCategory !== "all") {
        params.set("service_category", serviceCategory);
      }
      const response = await apiRequest<ReferenceRangeItem[]>(`/api/reference-ranges${params.toString() ? `?${params.toString()}` : ""}`);
      setRanges(response);
      setStatusMessage(`Loaded ${response.length} reference ranges from the backend.`);
      if (!form.id && response[0]) {
        setForm(toFormState(response[0]));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load reference ranges.";
      setStatusMessage(message);
      setRanges([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog(query: string) {
    try {
      const response = await apiRequest<CatalogItem[]>(`/api/catalog/tests?query=${encodeURIComponent(query)}&limit=12`);
      setCatalogOptions(response);
    } catch {
      setCatalogOptions([]);
    }
  }

  function selectRange(item: ReferenceRangeItem) {
    setForm(toFormState(item));
    setCatalogSearch("");
    setCatalogOptions([]);
    setStatusMessage(`Editing ${item.test_name} (${item.test_code}).`);
  }

  function startNewRange() {
    setForm(emptyForm);
    setCatalogSearch("");
    setCatalogOptions([]);
    setStatusMessage("Creating a new reference range.");
  }

  function chooseCatalog(item: CatalogItem) {
    setForm((current) => ({
      ...current,
      test_id: item.id,
      test_label: `${item.test_name} (${item.test_code})`,
      unit: current.unit || item.unit || "",
      reference_range_text: current.reference_range_text || item.reference_range_text || "",
    }));
    setCatalogSearch(`${item.test_name} (${item.test_code})`);
    setCatalogOptions([]);
  }

  async function saveRange() {
    if (!form.test_id) {
      setStatusMessage("Select a test before saving the reference range.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        test_id: form.test_id,
        sex: form.sex || null,
        min_age_years: form.min_age_years ? Number(form.min_age_years) : null,
        max_age_years: form.max_age_years ? Number(form.max_age_years) : null,
        unit: form.unit || null,
        reference_range_text: form.reference_range_text || null,
        method_name: form.method_name || null,
        critical_low: form.critical_low ? Number(form.critical_low) : null,
        critical_high: form.critical_high ? Number(form.critical_high) : null,
        is_default: form.is_default,
      };

      const response = form.id
        ? await apiRequest<ReferenceRangeItem>(`/api/reference-ranges/${form.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<ReferenceRangeItem>("/api/reference-ranges", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      setStatusMessage(`${response.test_name} reference range ${form.id ? "updated" : "created"} successfully.`);
      setForm(toFormState(response));
      setCatalogSearch("");
      await loadRanges();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the reference range.";
      setStatusMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRange() {
    if (!form.id) {
      return;
    }

    setDeleting(true);
    try {
      await apiRequest(`/api/reference-ranges/${form.id}`, { method: "DELETE" });
      setStatusMessage("Reference range deleted successfully.");
      setForm(emptyForm);
      setCatalogSearch("");
      await loadRanges();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the reference range.";
      setStatusMessage(message);
    } finally {
      setDeleting(false);
    }
  }

  const filteredStats = useMemo(() => {
    const laboratory = ranges.filter((item) => item.service_category === "laboratory").length;
    const radiology = ranges.filter((item) => item.service_category === "radiology").length;
    const cardiology = ranges.filter((item) => item.service_category === "cardiology").length;
    return { laboratory, radiology, cardiology };
  }, [ranges]);

  return (
    <AppShell
      overline="Laboratory Configuration"
      title="Reference Range Admin"
      searchPlaceholder="Search test code, analyte, or range..."
      action={
        <button className="range-admin-primary-btn" type="button" onClick={startNewRange}>
          + New Range
        </button>
      }
    >
      <section className="range-admin-page">
        <div className="range-admin-summary-grid">
          <article className="panel range-admin-summary-card">
            <div className="range-admin-summary-label">Loaded Ranges</div>
            <strong>{ranges.length}</strong>
            <span>{loading ? "Refreshing from backend" : "Active validation rows"}</span>
          </article>
          <article className="panel range-admin-summary-card">
            <div className="range-admin-summary-label">Laboratory</div>
            <strong>{filteredStats.laboratory}</strong>
            <span>Biochemistry, hematology, microbiology</span>
          </article>
          <article className="panel range-admin-summary-card">
            <div className="range-admin-summary-label">Imaging / Cardiology</div>
            <strong>{filteredStats.radiology + filteredStats.cardiology}</strong>
            <span>Diagnostic services tracked separately</span>
          </article>
        </div>

        <section className="panel range-admin-toolbar">
          <div className="range-admin-toolbar-grid">
            <div className="field">
              <label className="label">Search</label>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Glucose, HBA1C, Creatinine..." />
            </div>
            <div className="field">
              <label className="label">Service Category</label>
              <select className="input" value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)}>
                <option value="all">All categories</option>
                <option value="laboratory">Laboratory</option>
                <option value="radiology">Radiology</option>
                <option value="cardiology">Cardiology</option>
              </select>
            </div>
            <button className="secondary-btn range-admin-filter-btn" type="button" onClick={() => void loadRanges()} disabled={loading}>
              {loading ? "Loading..." : "Refresh List"}
            </button>
          </div>
          <div className="range-admin-status-note">{statusMessage}</div>
        </section>

        <div className="range-admin-grid">
          <section className="panel range-admin-list-card">
            <div className="range-admin-card-head">
              <div>
                <div className="collection-section-kicker">Configured Rows</div>
                <h3>Reference Range Library</h3>
              </div>
            </div>

            <div className="range-admin-table-head">
              <span>Test</span>
              <span>Demographic Rule</span>
              <span>Reference</span>
              <span>Default</span>
            </div>

            <div className="range-admin-table-body">
              {ranges.length > 0 ? (
                ranges.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`range-admin-row ${form.id === item.id ? "active" : ""}`}
                    onClick={() => selectRange(item)}
                  >
                    <div className="range-admin-test-cell">
                      <strong>{item.test_name}</strong>
                      <span>{item.test_code} ? {item.service_category}</span>
                    </div>
                    <div className="range-admin-rule-cell">
                      <span>{item.sex ? item.sex.toUpperCase() : "ALL"}</span>
                      <small>{item.min_age_years ?? 0} - {item.max_age_years ?? "Any"} yrs</small>
                    </div>
                    <div className="range-admin-reference-cell">
                      <strong>{item.reference_range_text || "--"}</strong>
                      <span>{item.unit || "No unit"}</span>
                    </div>
                    <div className="range-admin-default-cell">{item.is_default ? "Yes" : "No"}</div>
                  </button>
                ))
              ) : (
                <div className="empty-state">No reference ranges matched this filter yet.</div>
              )}
            </div>
          </section>

          <section className="panel range-admin-editor-card">
            <div className="range-admin-card-head">
              <div>
                <div className="collection-section-kicker">Editor</div>
                <h3>{form.id ? "Update Reference Range" : "Create Reference Range"}</h3>
              </div>
            </div>

            <div className="range-admin-form-grid">
              <div className="field range-admin-full-span">
                <label className="label">Test Lookup</label>
                <input
                  className="input"
                  value={catalogSearch || form.test_label}
                  onChange={(event) => {
                    setCatalogSearch(event.target.value);
                    if (!event.target.value.trim()) {
                      setForm((current) => ({ ...current, test_id: "", test_label: "" }));
                    }
                  }}
                  placeholder="Start typing test name or code..."
                />
                {catalogOptions.length > 0 ? (
                  <div className="range-admin-catalog-popover">
                    {catalogOptions.map((item) => (
                      <button key={item.id} type="button" className="range-admin-catalog-option" onClick={() => chooseCatalog(item)}>
                        <strong>{item.test_name}</strong>
                        <span>{item.test_code} ? {item.service_category}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label className="label">Sex</label>
                <select className="input" value={form.sex} onChange={(event) => setForm((current) => ({ ...current, sex: event.target.value }))}>
                  <option value="">All</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Unit</label>
                <input className="input" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} placeholder="mg/dL, mmol/L, %, Negative" />
              </div>
              <div className="field">
                <label className="label">Min Age (Years)</label>
                <input className="input" type="number" value={form.min_age_years} onChange={(event) => setForm((current) => ({ ...current, min_age_years: event.target.value }))} placeholder="0" />
              </div>
              <div className="field">
                <label className="label">Max Age (Years)</label>
                <input className="input" type="number" value={form.max_age_years} onChange={(event) => setForm((current) => ({ ...current, max_age_years: event.target.value }))} placeholder="120" />
              </div>
              <div className="field range-admin-full-span">
                <label className="label">Reference Range Text</label>
                <input className="input" value={form.reference_range_text} onChange={(event) => setForm((current) => ({ ...current, reference_range_text: event.target.value }))} placeholder="70 - 99, Negative, No growth" />
              </div>
              <div className="field range-admin-full-span">
                <label className="label">Method Name</label>
                <input className="input" value={form.method_name} onChange={(event) => setForm((current) => ({ ...current, method_name: event.target.value }))} placeholder="Hexokinase/UV, HPLC, Potentiometry" />
              </div>
              <div className="field">
                <label className="label">Critical Low</label>
                <input className="input" type="number" step="0.0001" value={form.critical_low} onChange={(event) => setForm((current) => ({ ...current, critical_low: event.target.value }))} placeholder="Optional" />
              </div>
              <div className="field">
                <label className="label">Critical High</label>
                <input className="input" type="number" step="0.0001" value={form.critical_high} onChange={(event) => setForm((current) => ({ ...current, critical_high: event.target.value }))} placeholder="Optional" />
              </div>
              <label className="range-admin-checkbox-row range-admin-full-span">
                <input type="checkbox" checked={form.is_default} onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))} />
                <span>Mark this as the default fallback row for the selected test</span>
              </label>
            </div>

            <div className="range-admin-action-row">
              <button className="secondary-btn" type="button" onClick={startNewRange}>Clear Form</button>
              <div className="range-admin-action-group">
                {form.id ? (
                  <button className="range-admin-danger-btn" type="button" onClick={() => void removeRange()} disabled={deleting || saving}>
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
                <button className="range-admin-primary-btn" type="button" onClick={() => void saveRange()} disabled={saving || deleting}>
                  {saving ? "Saving..." : form.id ? "Update Range" : "Create Range"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
