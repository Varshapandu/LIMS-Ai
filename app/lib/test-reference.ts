export type TestReferenceMetadata = {
  unit?: string | null;
  reference_range_text?: string | null;
  method_name?: string | null;
};

const bioRules: Array<[string, TestReferenceMetadata]> = [
  ["albumin", { unit: "g/dL", reference_range_text: "3.4 - 5.4", method_name: "Bromocresol Green" }],
  ["alkaline phosphatase", { unit: "U/L", reference_range_text: "20 - 130", method_name: "IFCC Kinetic" }],
  ["alt", { unit: "U/L", reference_range_text: "4 - 36", method_name: "IFCC UV Kinetic" }],
  ["ammonia", { unit: "umol/L", reference_range_text: "15 - 45", method_name: "Enzymatic UV" }],
  ["amylase", { unit: "U/L", reference_range_text: "30 - 110", method_name: "Enzymatic Colorimetric" }],
  ["ast", { unit: "U/L", reference_range_text: "8 - 33", method_name: "IFCC UV Kinetic" }],
  ["bicarbonate", { unit: "mmol/L", reference_range_text: "23 - 29", method_name: "Enzymatic" }],
  ["bilirubin direct", { unit: "mg/dL", reference_range_text: "0.0 - 0.3", method_name: "Diazo" }],
  ["bilirubin total", { unit: "mg/dL", reference_range_text: "0.1 - 1.2", method_name: "Diazo" }],
  ["blood urea nitrogen", { unit: "mg/dL", reference_range_text: "6 - 20", method_name: "Urease/GLDH" }],
  ["calcium", { unit: "mg/dL", reference_range_text: "8.5 - 10.2", method_name: "Arsenazo III" }],
  ["chloride", { unit: "mmol/L", reference_range_text: "96 - 106", method_name: "Ion Selective Electrode" }],
  ["cholesterol total", { unit: "mg/dL", reference_range_text: "125 - 200", method_name: "Enzymatic Colorimetric" }],
  ["creatinine", { unit: "mg/dL", reference_range_text: "0.6 - 1.1 F / 0.7 - 1.3 M", method_name: "Enzymatic" }],
  ["c reactive protein", { unit: "mg/dL", reference_range_text: "0.0 - 0.3", method_name: "Immunoturbidimetric" }],
  ["d dimer", { unit: "ug/mL FEU", reference_range_text: "0.0 - 0.5", method_name: "Latex Immunoassay" }],
  ["ferritin", { unit: "ng/mL", reference_range_text: "13 - 150 (F), 30 - 400 (M)", method_name: "CLIA" }],
  ["folate", { unit: "ng/mL", reference_range_text: "2.7 - 17.0", method_name: "CLIA" }],
  ["free t4", { unit: "ng/dL", reference_range_text: "0.8 - 1.9", method_name: "CLIA" }],
  ["gamma gt", { unit: "U/L", reference_range_text: "9 - 48", method_name: "Enzymatic Colorimetric" }],
  ["glucose fasting", { unit: "mg/dL", reference_range_text: "70 - 99", method_name: "Hexokinase/UV" }],
  ["glucose random", { unit: "mg/dL", reference_range_text: "70 - 125", method_name: "Hexokinase/UV" }],
  ["glucose post prandial", { unit: "mg/dL", reference_range_text: "70 - 140", method_name: "Hexokinase/UV" }],
  ["glucose", { unit: "mg/dL", reference_range_text: "70 - 99", method_name: "Hexokinase/UV" }],
  ["hdl cholesterol", { unit: "mg/dL", reference_range_text: "40 - 60", method_name: "Direct Enzymatic" }],
  ["ldl cholesterol", { unit: "mg/dL", reference_range_text: "0 - 100", method_name: "Direct Enzymatic" }],
  ["lipase", { unit: "U/L", reference_range_text: "13 - 60", method_name: "Enzymatic Colorimetric" }],
  ["magnesium", { unit: "mg/dL", reference_range_text: "1.7 - 2.2", method_name: "Colorimetric" }],
  ["microalbumin 24 hour urine", { unit: "mg/24 hr", reference_range_text: "0 - 30", method_name: "Immunoturbidimetric" }],
  ["microalbumin urine", { unit: "mg/L", reference_range_text: "0 - 30", method_name: "Immunoturbidimetric" }],
  ["microalbumin", { unit: "mg/L", reference_range_text: "0 - 30", method_name: "Immunoturbidimetric" }],
  ["phosphorus", { unit: "mg/dL", reference_range_text: "Adults: 2.8 - 4.5 / Children: 4.0 - 7.0", method_name: "Phosphomolybdate UV" }],
  ["potassium", { unit: "mmol/L", reference_range_text: "3.7 - 5.2", method_name: "Ion Selective Electrode" }],
  ["protein total", { unit: "g/dL", reference_range_text: "6.0 - 8.3", method_name: "Biuret" }],
  ["sodium", { unit: "mmol/L", reference_range_text: "135 - 145", method_name: "Ion Selective Electrode" }],
  ["triglycerides", { unit: "mg/dL", reference_range_text: "0 - 150", method_name: "Enzymatic Colorimetric" }],
  ["tsh", { unit: "uIU/mL", reference_range_text: "0.45 - 4.50", method_name: "ICMA" }],
  ["uric acid", { unit: "mg/dL", reference_range_text: "2.5 - 6.2 F / 3.5 - 7.2 M", method_name: "Uricase" }],
  ["vitamin b12", { unit: "pg/mL", reference_range_text: "160 - 950", method_name: "CLIA" }],
  ["vitamin d", { unit: "ng/mL", reference_range_text: "20 - 40", method_name: "25-OH Immunoassay" }],
];

const hemRules: Array<[string, TestReferenceMetadata]> = [
  ["hemoglobin", { unit: "g/dL", reference_range_text: "12 - 16 F / 13 - 18 M", method_name: "Cyanmethemoglobin" }],
  ["hematocrit", { unit: "%", reference_range_text: "36 - 48 F / 40 - 55 M", method_name: "Automated Analyzer" }],
  ["packed cell volume", { unit: "%", reference_range_text: "36 - 48 F / 40 - 55 M", method_name: "Automated Analyzer" }],
  ["platelet count", { unit: "cells/mcL", reference_range_text: "150000 - 400000", method_name: "Automated Count" }],
  ["wbc count", { unit: "cells/mcL", reference_range_text: "4500 - 11000", method_name: "Automated Count" }],
  ["total leukocyte count", { unit: "cells/mcL", reference_range_text: "4500 - 11000", method_name: "Automated Count" }],
  ["leukocyte count", { unit: "cells/mcL", reference_range_text: "4500 - 11000", method_name: "Automated Count" }],
  ["rbc count", { unit: "million cells/mcL", reference_range_text: "4.2 - 5.4 F / 4.6 - 6.2 M", method_name: "Automated Count" }],
  ["mcv", { unit: "fL", reference_range_text: "80 - 100", method_name: "Calculated" }],
  ["mchc", { unit: "g/dL", reference_range_text: "32 - 36", method_name: "Calculated" }],
  ["mch", { unit: "pg", reference_range_text: "27 - 31", method_name: "Calculated" }],
  ["red cell distribution width", { unit: "%", reference_range_text: "11.5 - 14.5", method_name: "Calculated" }],
  ["mean platelet volume", { unit: "fL", reference_range_text: "7.4 - 10.4", method_name: "Automated Analyzer" }],
  ["erythrocyte sedimentation rate", { unit: "mm/hr", reference_range_text: "<15 M / <20 F", method_name: "Westergren" }],
  ["prothrombin time", { unit: "sec", reference_range_text: "11 - 13.5", method_name: "Coagulometric" }],
  ["activated partial thromboplastin time", { unit: "sec", reference_range_text: "25 - 35", method_name: "Coagulometric" }],
  ["thrombin time", { unit: "sec", reference_range_text: "14 - 19", method_name: "Coagulometric" }],
  ["reticulocyte count", { unit: "%", reference_range_text: "0.5 - 2.5", method_name: "Supravital Stain" }],
  ["blood grouping", { unit: null, reference_range_text: "A / B / AB / O with Rh typing", method_name: "Tube Agglutination" }],
  ["peripheral smear", { unit: null, reference_range_text: "Normal morphology", method_name: "Microscopy" }],
  ["sickle cell screen", { unit: null, reference_range_text: "Negative", method_name: "Solubility Test" }],
];

const radiologyCardiology = {
  unit: null,
  reference_range_text: "Narrative impression",
  method_name: "Narrative / Specialist Review",
};

const microbiologyRules: Array<[string, TestReferenceMetadata]> = [
  ["antigen", { unit: null, reference_range_text: "Negative", method_name: "Rapid Antigen" }],
  ["antibody", { unit: null, reference_range_text: "Non-reactive", method_name: "Immunoassay" }],
  ["pcr", { unit: null, reference_range_text: "Negative", method_name: "PCR" }],
  ["screen", { unit: null, reference_range_text: "Negative", method_name: "Screening Assay" }],
  ["confirmatory", { unit: null, reference_range_text: "Negative", method_name: "Confirmatory Assay" }],
  ["rapid", { unit: null, reference_range_text: "Negative", method_name: "Rapid Assay" }],
  ["panel", { unit: null, reference_range_text: "Negative", method_name: "Panel Assay" }],
  ["multiplex", { unit: null, reference_range_text: "Negative", method_name: "Multiplex PCR" }],
  ["culture", { unit: null, reference_range_text: "No growth / No pathogen isolated", method_name: "Culture" }],
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[/-]/g, " ").replace(/\s+/g, " ").trim();
}

export function getTestReferenceMetadata(testName: string, serviceCategory = "laboratory"): TestReferenceMetadata {
  const normalized = normalize(testName);
  const category = serviceCategory.toLowerCase();

  if (category === "radiology" || category === "cardiology") {
    return radiologyCardiology;
  }

  if (["mri", "ct ", "x ray", "ultrasound", "mammography", "dexa", "ecg", "echo", "tmt", "holter"].some((key) => normalized.includes(key))) {
    return radiologyCardiology;
  }

  if (normalized.startsWith("acid fast bacilli") || normalized.startsWith("salmonella typhi")) {
    return { unit: null, reference_range_text: "Negative", method_name: "Confirmatory Assay" };
  }

  for (const [pattern, metadata] of microbiologyRules) {
    if (normalized.includes(pattern)) {
      return metadata;
    }
  }

  for (const [pattern, metadata] of bioRules) {
    if (normalized.includes(pattern)) {
      return metadata;
    }
  }

  for (const [pattern, metadata] of hemRules) {
    if (normalized.includes(pattern)) {
      return metadata;
    }
  }

  return { unit: null, reference_range_text: null, method_name: "Analyzer Entry" };
}


function normalizeSex(sex?: string | null) {
  if (!sex) return null;
  const normalized = sex.trim().toLowerCase();
  if (normalized.startsWith("f")) return "F";
  if (normalized.startsWith("m")) return "M";
  return null;
}

export function resolveDisplayReferenceRange(referenceRangeText?: string | null, sex?: string | null, ageYears?: number | null) {
  if (!referenceRangeText) {
    return referenceRangeText ?? null;
  }

  const cleaned = referenceRangeText
    .trim()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ");
  const normalizedSex = normalizeSex(sex);

  const adultsChildren = cleaned.match(/^Adults:\s*(.+?)\s*\/\s*Children:\s*(.+)$/i);
  if (adultsChildren) {
    return ageYears !== null && ageYears !== undefined && ageYears < 18 ? adultsChildren[2].trim() : adultsChildren[1].trim();
  }

  const parenthetical = cleaned.match(/^(.+?)\s*\(F\),\s*(.+?)\s*\(M\)$/i);
  if (parenthetical && normalizedSex) {
    return normalizedSex === "F" ? parenthetical[1].trim() : parenthetical[2].trim();
  }

  const femaleMale = cleaned.match(/^(.+?)\s+F\s*\/\s*(.+?)\s+M$/i);
  if (femaleMale && normalizedSex) {
    return normalizedSex === "F" ? femaleMale[1].trim() : femaleMale[2].trim();
  }

  const maleFemale = cleaned.match(/^(.+?)\s+M\s*\/\s*(.+?)\s+F$/i);
  if (maleFemale && normalizedSex) {
    return normalizedSex === "F" ? maleFemale[2].trim() : maleFemale[1].trim();
  }

  return cleaned;
}
