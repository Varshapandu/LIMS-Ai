import { getTestReferenceMetadata } from "./test-reference";

export type LocalCatalogTestItem = {
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
  method_name?: string | null;
};

const bioAnalytes = [
  "Albumin", "Alkaline Phosphatase", "ALT", "Ammonia", "Amylase", "Apolipoprotein A1", "Apolipoprotein B",
  "AST", "Bicarbonate", "Bilirubin Direct", "Bilirubin Total", "Blood Urea Nitrogen", "Calcium",
  "Chloride", "Cholesterol Total", "CK Total", "Cortisol", "Creatinine", "C Reactive Protein",
  "D Dimer", "Ferritin", "Folate", "Free T3", "Free T4", "Fructosamine", "Gamma GT", "Glucose",
  "HDL Cholesterol", "Homocysteine", "Insulin", "Iron", "LDH", "LDL Cholesterol", "Lipase",
  "Magnesium", "Manganese", "Metanephrine", "Microalbumin", "Myoglobin", "Phosphorus", "Potassium",
  "Procalcitonin", "Protein Total", "Sodium", "Transferrin", "Triglycerides", "Troponin I", "Troponin T",
  "TSH", "Uric Acid", "Vitamin B12", "Vitamin D",
];
const bioVariants = ["Serum", "Plasma", "Fasting", "Random", "Post Prandial", "Panel", "Extended Panel", "Urine", "24 Hour Urine", "STAT", "Baseline", "Follow Up"];

const hemAnalytes = [
  "Absolute Basophil Count", "Absolute Eosinophil Count", "Absolute Lymphocyte Count", "Absolute Monocyte Count",
  "Absolute Neutrophil Count", "Basophil Count", "Bleeding Time", "Blood Grouping", "Clotting Time",
  "Complete Blood Count", "Differential Count", "Eosinophil Count", "Erythrocyte Sedimentation Rate",
  "Fibrinogen", "Hematocrit", "Hemoglobin", "Leukocyte Count", "Lymphocyte Count", "MCH", "MCHC",
  "MCV", "Mean Platelet Volume", "Monocyte Count", "Packed Cell Volume", "Peripheral Smear", "Platelet Count",
  "Prothrombin Time", "Reticulocyte Count", "RBC Count", "Red Cell Distribution Width", "Sickle Cell Screen",
  "Thrombin Time", "Total Leukocyte Count", "WBC Count", "Activated Partial Thromboplastin Time",
];
const hemVariants = ["Automated", "Manual Differential", "Peripheral Smear", "Baseline", "Follow Up", "EDTA", "Screening", "STAT", "Pre Operative", "Extended", "Retic", "Profile"];

const micAnalytes = [
  "Acid Fast Bacilli", "Anaerobic Culture", "Blood Culture", "Candida Panel", "Clostridium difficile",
  "COVID 19", "CSF Culture", "Dengue Antigen", "Dengue Antibody", "Fungal Culture", "Gene Panel",
  "Hepatitis B Surface Antigen", "Hepatitis C Antibody", "HIV Screen", "Influenza A B", "Malaria Antigen",
  "Microbial Identification", "MRSA Screen", "Respiratory Pathogen", "Salmonella Typhi", "Sputum Culture",
  "Stool Culture", "TB PCR", "Throat Swab Culture", "Typhoid IgM", "Urine Culture",
];
const micVariants = ["Culture", "PCR", "Antigen", "Antibody", "Rapid", "Panel", "Screening", "Confirmatory", "Surveillance", "Baseline", "Follow Up", "Multiplex"];

const radiologyServices = [
  ["MRI Brain", "Radiology", "Imaging Suite", "MRI Console", 45, 4200],
  ["MRI Cervical Spine", "Radiology", "Imaging Suite", "MRI Console", 50, 4300],
  ["MRI Knee", "Radiology", "Imaging Suite", "MRI Console", 40, 3900],
  ["CT Brain", "Radiology", "Imaging Suite", "CT Scanner", 30, 3200],
  ["CT Abdomen", "Radiology", "Imaging Suite", "CT Scanner", 35, 3600],
  ["CT Chest HRCT", "Radiology", "Imaging Suite", "CT Scanner", 35, 4100],
  ["X-Ray Chest PA", "Radiology", "Imaging Suite", "Digital X-Ray", 20, 650],
  ["X-Ray Knee AP/LAT", "Radiology", "Imaging Suite", "Digital X-Ray", 20, 700],
  ["Ultrasound Abdomen", "Radiology", "Ultrasound Suite", "USG Console", 25, 1800],
  ["Ultrasound Pelvis", "Radiology", "Ultrasound Suite", "USG Console", 25, 1750],
  ["Mammography Screening", "Radiology", "Imaging Suite", "Mammography Unit", 25, 2200],
  ["Dexa Scan", "Radiology", "Imaging Suite", "Dexa Scanner", 20, 2000],
] as const;

const cardiologyServices = [
  ["ECG Resting", "Cardiology", "Cardiac Diagnostics", "ECG Machine", 15, 450],
  ["2D Echo", "Cardiology", "Cardiac Diagnostics", "Echo Console", 30, 2200],
  ["TMT Stress Test", "Cardiology", "Cardiac Diagnostics", "Treadmill", 35, 2600],
  ["Holter Monitoring 24H", "Cardiology", "Cardiac Diagnostics", "Holter Device", 40, 3200],
  ["Ambulatory Blood Pressure Monitoring", "Cardiology", "Cardiac Diagnostics", "ABPM Device", 35, 1800],
] as const;

function buildRows(prefix: string, departmentName: string, serviceCategory: string, analytes: string[], variants: string[], sampleType: string, containerType: string, basePrice: number) {
  return analytes.flatMap((analyte, analyteIndex) =>
    variants.map((variant, variantIndex) => {
      const testName = `${analyte} ${variant}`;
      const metadata = getTestReferenceMetadata(testName, serviceCategory);
      return {
        id: `${prefix}-${analyteIndex + 1}-${variantIndex + 1}`,
        test_code: `${prefix}${String(analyteIndex + 1).padStart(2, "0")}${String(variantIndex + 1).padStart(2, "0")}`,
        test_name: testName,
        service_category: serviceCategory,
        sample_type: sampleType,
        container_type: containerType,
        department_name: departmentName,
        price: String(basePrice + analyteIndex + (variantIndex + 1) * 5),
        turnaround_minutes: 180 + (variantIndex + 1) * 15,
        unit: metadata.unit ?? null,
        reference_range_text: metadata.reference_range_text ?? null,
        method_name: metadata.method_name ?? null,
      };
    }),
  );
}

const localCatalog: LocalCatalogTestItem[] = [
  {
    id: "GLU-base",
    test_code: "GLU",
    test_name: "Glucose Fasting",
    service_category: "laboratory",
    sample_type: "Serum",
    container_type: "Grey Top",
    department_name: "Biochemistry",
    price: "220",
    turnaround_minutes: 240,
    unit: "mg/dL",
    reference_range_text: "70 - 99",
    method_name: "Hexokinase/UV",
  },
  {
    id: "CBC-base",
    test_code: "CBC",
    test_name: "Complete Blood Count",
    service_category: "laboratory",
    sample_type: "Whole Blood",
    container_type: "EDTA",
    department_name: "Hematology",
    price: "450",
    turnaround_minutes: 360,
    unit: null,
    reference_range_text: "See component analytes",
    method_name: "Automated Hematology Analyzer",
  },
  {
    id: "HBA1C-base",
    test_code: "HBA1C",
    test_name: "HbA1c",
    service_category: "laboratory",
    sample_type: "Whole Blood",
    container_type: "EDTA",
    department_name: "Biochemistry",
    price: "650",
    turnaround_minutes: 480,
    unit: "%",
    reference_range_text: "4.0 - 5.6",
    method_name: "HPLC",
  },
  ...buildRows("BIO", "Biochemistry", "laboratory", bioAnalytes, bioVariants, "Serum", "Plain / Gel", 180),
  ...buildRows("HEM", "Hematology", "laboratory", hemAnalytes, hemVariants, "Whole Blood", "EDTA", 220),
  ...buildRows("MIC", "Microbiology", "laboratory", micAnalytes, micVariants, "Swab / Fluid", "Sterile Container", 260),
  ...radiologyServices.map(([name, department, sampleType, containerType, turnaround, price], index) => {
    const metadata = getTestReferenceMetadata(name, "radiology");
    return {
      id: `RAD-${index + 1}`,
      test_code: `RAD${String(index + 1).padStart(3, "0")}`,
      test_name: name,
      service_category: "radiology",
      sample_type: sampleType,
      container_type: containerType,
      department_name: department,
      price: String(price),
      turnaround_minutes: turnaround,
      unit: metadata.unit ?? null,
      reference_range_text: metadata.reference_range_text ?? null,
      method_name: metadata.method_name ?? null,
    };
  }),
  ...cardiologyServices.map(([name, department, sampleType, containerType, turnaround, price], index) => {
    const metadata = getTestReferenceMetadata(name, "cardiology");
    return {
      id: `CAR-${index + 1}`,
      test_code: `CAR${String(index + 1).padStart(3, "0")}`,
      test_name: name,
      service_category: "cardiology",
      sample_type: sampleType,
      container_type: containerType,
      department_name: department,
      price: String(price),
      turnaround_minutes: turnaround,
      unit: metadata.unit ?? null,
      reference_range_text: metadata.reference_range_text ?? null,
      method_name: metadata.method_name ?? null,
    };
  }),
];

export function searchLocalCatalog(query: string, limit = 12): LocalCatalogTestItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return localCatalog
    .filter((test) => test.test_name.toLowerCase().includes(normalized) || test.test_code.toLowerCase().includes(normalized))
    .sort((left, right) => {
      const leftStarts = left.test_name.toLowerCase().startsWith(normalized) || left.test_code.toLowerCase().startsWith(normalized);
      const rightStarts = right.test_name.toLowerCase().startsWith(normalized) || right.test_code.toLowerCase().startsWith(normalized);
      if (leftStarts && !rightStarts) return -1;
      if (!leftStarts && rightStarts) return 1;
      return left.test_name.localeCompare(right.test_name);
    })
    .slice(0, limit);
}

export function getLocalCatalogTestByCodeOrName(testCode: string, testName?: string): LocalCatalogTestItem | undefined {
  return localCatalog.find((item) => item.test_code === testCode || (testName ? item.test_name.toLowerCase() === testName.toLowerCase() : false));
}

export function getAllLocalCatalogTests(): LocalCatalogTestItem[] {
  return [...localCatalog];
}
