from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from app.models.models import SexType
import re


@dataclass(frozen=True)
class TestReferenceMetadata:
    unit: str | None = None
    reference_range_text: str | None = None
    method_name: str | None = None
    critical_low: Decimal | None = None
    critical_high: Decimal | None = None


BIOCHEMISTRY_RULES: list[tuple[str, TestReferenceMetadata]] = [
    ("albumin", TestReferenceMetadata("g/dL", "3.4 - 5.4", "Bromocresol Green")),
    ("alkaline phosphatase", TestReferenceMetadata("U/L", "20 - 130", "IFCC Kinetic")),
    ("alt", TestReferenceMetadata("U/L", "4 - 36", "IFCC UV Kinetic")),
    ("ammonia", TestReferenceMetadata("umol/L", "15 - 45", "Enzymatic UV")),
    ("amylase", TestReferenceMetadata("U/L", "30 - 110", "Enzymatic Colorimetric")),
    ("apolipoprotein a1", TestReferenceMetadata("mg/dL", "110 - 180", "Immunoturbidimetric")),
    ("apolipoprotein b", TestReferenceMetadata("mg/dL", "55 - 140", "Immunoturbidimetric")),
    ("ast", TestReferenceMetadata("U/L", "8 - 33", "IFCC UV Kinetic")),
    ("bicarbonate", TestReferenceMetadata("mmol/L", "23 - 29", "Enzymatic")),
    ("bilirubin direct", TestReferenceMetadata("mg/dL", "0.0 - 0.3", "Diazo")),
    ("bilirubin total", TestReferenceMetadata("mg/dL", "0.1 - 1.2", "Diazo")),
    ("blood urea nitrogen", TestReferenceMetadata("mg/dL", "6 - 20", "Urease/GLDH", Decimal("6"), Decimal("20"))),
    ("calcium", TestReferenceMetadata("mg/dL", "8.5 - 10.2", "Arsenazo III", Decimal("7.0"), Decimal("12.0"))),
    ("chloride", TestReferenceMetadata("mmol/L", "96 - 106", "Ion Selective Electrode", Decimal("90"), Decimal("110"))),
    ("cholesterol total", TestReferenceMetadata("mg/dL", "125 - 200", "Enzymatic Colorimetric")),
    ("ck total", TestReferenceMetadata("U/L", "24 - 170", "UV Kinetic")),
    ("cortisol", TestReferenceMetadata("ug/dL", "6 - 23", "Chemiluminescent Immunoassay")),
    ("creatinine", TestReferenceMetadata("mg/dL", "0.6 - 1.1 F / 0.7 - 1.3 M", "Enzymatic", Decimal("0.3"), Decimal("5.0"))),
    ("c reactive protein", TestReferenceMetadata("mg/dL", "0.0 - 0.3", "Immunoturbidimetric")),
    ("d dimer", TestReferenceMetadata("ug/mL FEU", "0.0 - 0.5", "Latex Immunoassay")),
    ("ferritin", TestReferenceMetadata("ng/mL", "13 - 150 (F), 30 - 400 (M)", "Chemiluminescent Immunoassay")),
    ("folate", TestReferenceMetadata("ng/mL", "2.7 - 17.0", "Chemiluminescent Immunoassay")),
    ("free t3", TestReferenceMetadata("pg/dL", "130 - 450", "CLIA")),
    ("free t4", TestReferenceMetadata("ng/dL", "0.8 - 1.9", "CLIA")),
    ("fructosamine", TestReferenceMetadata("umol/L", "205 - 285", "NBT Colorimetric")),
    ("gamma gt", TestReferenceMetadata("U/L", "9 - 48", "Enzymatic Colorimetric")),
    ("glucose", TestReferenceMetadata("mg/dL", "70 - 99", "Hexokinase/UV", Decimal("54"), Decimal("200"))),
    ("hdl cholesterol", TestReferenceMetadata("mg/dL", "40 - 60", "Direct Enzymatic")),
    ("homocysteine", TestReferenceMetadata("umol/L", "5 - 15", "Enzymatic")),
    ("insulin", TestReferenceMetadata("uIU/mL", "2.6 - 24.9", "CLIA")),
    ("iron", TestReferenceMetadata("ug/dL", "60 - 170", "Ferrozine")),
    ("ldh", TestReferenceMetadata("U/L", "140 - 280", "UV Kinetic")),
    ("ldl cholesterol", TestReferenceMetadata("mg/dL", "0 - 100", "Direct Enzymatic")),
    ("lipase", TestReferenceMetadata("U/L", "13 - 60", "Enzymatic Colorimetric")),
    ("magnesium", TestReferenceMetadata("mg/dL", "1.7 - 2.2", "Colorimetric", Decimal("1.2"), Decimal("4.0"))),
    ("manganese", TestReferenceMetadata("ug/L", "4.7 - 18.3", "ICP-MS")),
    ("metanephrine", TestReferenceMetadata("pg/mL", "0 - 65", "LC-MS/MS")),
    ("microalbumin", TestReferenceMetadata("mg/L", "0 - 30", "Immunoturbidimetric")),
    ("myoglobin", TestReferenceMetadata("ng/mL", "0 - 85", "CLIA")),
    ("phosphorus", TestReferenceMetadata("mg/dL", "Adults: 2.8 - 4.5 / Children: 4.0 - 7.0", "Phosphomolybdate UV")),
    ("potassium", TestReferenceMetadata("mmol/L", "3.7 - 5.2", "Ion Selective Electrode", Decimal("2.5"), Decimal("6.0"))),
    ("procalcitonin", TestReferenceMetadata("ng/mL", "0.0 - 0.1", "CLIA")),
    ("protein total", TestReferenceMetadata("g/dL", "6.0 - 8.3", "Biuret")),
    ("sodium", TestReferenceMetadata("mmol/L", "135 - 145", "Ion Selective Electrode", Decimal("125"), Decimal("155"))),
    ("transferrin", TestReferenceMetadata("mg/dL", "200 - 360", "Immunoturbidimetric")),
    ("triglycerides", TestReferenceMetadata("mg/dL", "0 - 150", "Enzymatic Colorimetric")),
    ("troponin i", TestReferenceMetadata("ng/mL", "0.0 - 0.04", "High-Sensitivity Immunoassay")),
    ("troponin t", TestReferenceMetadata("ng/L", "0 - 14", "High-Sensitivity Immunoassay")),
    ("tsh", TestReferenceMetadata("uIU/mL", "0.45 - 4.50", "ICMA")),
    ("uric acid", TestReferenceMetadata("mg/dL", "2.5 - 6.2 F / 3.5 - 7.2 M", "Uricase")),
    ("vitamin b12", TestReferenceMetadata("pg/mL", "160 - 950", "CLIA")),
    ("vitamin d", TestReferenceMetadata("ng/mL", "20 - 40", "25-OH Immunoassay")),
]

HEMATOLOGY_RULES: list[tuple[str, TestReferenceMetadata]] = [
    ("absolute basophil count", TestReferenceMetadata("cells/mcL", "0 - 200", "Automated Differential")),
    ("absolute eosinophil count", TestReferenceMetadata("cells/mcL", "0 - 500", "Automated Differential")),
    ("absolute lymphocyte count", TestReferenceMetadata("cells/mcL", "1000 - 4800", "Automated Differential")),
    ("absolute monocyte count", TestReferenceMetadata("cells/mcL", "200 - 800", "Automated Differential")),
    ("absolute neutrophil count", TestReferenceMetadata("cells/mcL", "1500 - 8000", "Automated Differential")),
    ("basophil count", TestReferenceMetadata("%", "0 - 1", "Automated Differential")),
    ("bleeding time", TestReferenceMetadata("min", "2 - 7", "Ivy Method")),
    ("blood grouping", TestReferenceMetadata(None, "A / B / AB / O with Rh typing", "Tube Agglutination")),
    ("clotting time", TestReferenceMetadata("min", "8 - 15", "Capillary Method")),
    ("complete blood count", TestReferenceMetadata(None, "See component analytes", "Automated Hematology Analyzer")),
    ("differential count", TestReferenceMetadata("%", "Neut 40 - 70, Lymph 20 - 40, Mono 2 - 8, Eos 1 - 4, Baso 0 - 1", "Automated Differential")),
    ("eosinophil count", TestReferenceMetadata("%", "1 - 4", "Automated Differential")),
    ("erythrocyte sedimentation rate", TestReferenceMetadata("mm/hr", "<15 M / <20 F", "Westergren")),
    ("fibrinogen", TestReferenceMetadata("mg/dL", "200 - 400", "Clauss")),
    ("hematocrit", TestReferenceMetadata("%", "36 - 48 F / 40 - 55 M", "Automated Analyzer")),
    ("hemoglobin", TestReferenceMetadata("g/dL", "12 - 16 F / 13 - 18 M", "Cyanmethemoglobin")),
    ("leukocyte count", TestReferenceMetadata("cells/mcL", "4500 - 11000", "Automated Count")),
    ("lymphocyte count", TestReferenceMetadata("%", "20 - 40", "Automated Differential")),
    ("mchc", TestReferenceMetadata("g/dL", "32 - 36", "Calculated")),
    ("mch", TestReferenceMetadata("pg", "27 - 31", "Calculated")),
    ("mcv", TestReferenceMetadata("fL", "80 - 100", "Calculated")),
    ("mean platelet volume", TestReferenceMetadata("fL", "7.4 - 10.4", "Automated Analyzer")),
    ("monocyte count", TestReferenceMetadata("%", "2 - 8", "Automated Differential")),
    ("packed cell volume", TestReferenceMetadata("%", "36 - 48 F / 40 - 55 M", "Automated Analyzer")),
    ("peripheral smear", TestReferenceMetadata(None, "Normal morphology", "Microscopy")),
    ("platelet count", TestReferenceMetadata("cells/mcL", "150000 - 400000", "Automated Count")),
    ("prothrombin time", TestReferenceMetadata("sec", "11 - 13.5", "Coagulometric")),
    ("reticulocyte count", TestReferenceMetadata("%", "0.5 - 2.5", "Supravital Stain")),
    ("rbc count", TestReferenceMetadata("million cells/mcL", "4.2 - 5.4 F / 4.6 - 6.2 M", "Automated Count")),
    ("red cell distribution width", TestReferenceMetadata("%", "11.5 - 14.5", "Calculated")),
    ("sickle cell screen", TestReferenceMetadata(None, "Negative", "Solubility Test")),
    ("thrombin time", TestReferenceMetadata("sec", "14 - 19", "Coagulometric")),
    ("total leukocyte count", TestReferenceMetadata("cells/mcL", "4500 - 11000", "Automated Count")),
    ("wbc count", TestReferenceMetadata("cells/mcL", "4500 - 11000", "Automated Count")),
    ("activated partial thromboplastin time", TestReferenceMetadata("sec", "25 - 35", "Coagulometric")),
]

QUALITATIVE_NEGATIVE = TestReferenceMetadata(None, "Negative / Non-reactive", "Immunoassay")
QUALITATIVE_CULTURE = TestReferenceMetadata(None, "No growth / No pathogen isolated", "Culture")
RAD_CARD_METADATA = TestReferenceMetadata(None, None, "Narrative / Radiologist Review")


MICROBIOLOGY_METHODS: list[tuple[str, TestReferenceMetadata]] = [
    ("culture", QUALITATIVE_CULTURE),
    ("pcr", TestReferenceMetadata(None, "Negative", "PCR")),
    ("antigen", TestReferenceMetadata(None, "Negative", "Rapid Antigen")),
    ("antibody", TestReferenceMetadata(None, "Non-reactive", "Immunoassay")),
    ("screen", TestReferenceMetadata(None, "Negative", "Screening Assay")),
    ("confirmatory", TestReferenceMetadata(None, "Negative", "Confirmatory Assay")),
    ("rapid", TestReferenceMetadata(None, "Negative", "Rapid Assay")),
    ("multiplex", TestReferenceMetadata(None, "Negative", "Multiplex PCR")),
    ("panel", TestReferenceMetadata(None, "Negative", "Panel Assay")),
    ("surveillance", TestReferenceMetadata(None, "Negative", "Surveillance Assay")),
]


VARIANT_OVERRIDES: list[tuple[str, TestReferenceMetadata]] = [
    ("glucose fasting", TestReferenceMetadata("mg/dL", "70 - 99", "Hexokinase/UV", Decimal("54"), Decimal("200"))),
    ("glucose random", TestReferenceMetadata("mg/dL", "70 - 125", "Hexokinase/UV", Decimal("54"), Decimal("250"))),
    ("glucose post prandial", TestReferenceMetadata("mg/dL", "70 - 140", "Hexokinase/UV", Decimal("54"), Decimal("250"))),
    ("microalbumin 24 hour urine", TestReferenceMetadata("mg/24 hr", "0 - 30", "Immunoturbidimetric")),
    ("microalbumin urine", TestReferenceMetadata("mg/L", "0 - 30", "Immunoturbidimetric")),
    ("vitamin d", TestReferenceMetadata("ng/mL", "20 - 40", "25-OH Immunoassay")),
]


RADIOLOGY_KEYWORDS = ["mri", "ct ", "x-ray", "ultrasound", "mammography", "dexa"]
CARDIOLOGY_KEYWORDS = ["ecg", "echo", "tmt", "holter", "ambulatory blood pressure"]


def _normalize(text: str) -> str:
    return " ".join(text.lower().replace("/", " ").replace("-", " ").split())


def get_test_metadata(test_name: str, service_category: str = "laboratory") -> TestReferenceMetadata:
    normalized = _normalize(test_name)
    normalized_category = service_category.lower()

    if normalized_category in {"radiology", "cardiology"}:
        return RAD_CARD_METADATA

    if any(keyword in normalized for keyword in RADIOLOGY_KEYWORDS + CARDIOLOGY_KEYWORDS):
        return RAD_CARD_METADATA

    if normalized.startswith("acid fast bacilli") or normalized.startswith("salmonella typhi"):
        return TestReferenceMetadata(None, "Negative", "Confirmatory Assay")

    for keyword, metadata in MICROBIOLOGY_METHODS:
        if keyword in normalized:
            return metadata

    for keyword, metadata in VARIANT_OVERRIDES:
        if keyword in normalized:
            return metadata

    for keyword, metadata in BIOCHEMISTRY_RULES:
        if keyword in normalized:
            return metadata

    for keyword, metadata in HEMATOLOGY_RULES:
        if keyword in normalized:
            return metadata

    return TestReferenceMetadata(None, None, "Analyzer Entry")



def _normalize_sex(sex: str | None) -> str | None:
    if not sex:
        return None
    normalized = sex.strip().lower()
    if normalized.startswith("f"):
        return "F"
    if normalized.startswith("m"):
        return "M"
    return None


def resolve_reference_range(reference_range_text: str | None, sex: str | None = None, age_years: int | None = None) -> str | None:
    if not reference_range_text:
        return reference_range_text

    cleaned = reference_range_text.strip()
    normalized_sex = _normalize_sex(sex)

    adults_children = re.match(r"^Adults:\s*(.+?)\s*/\s*Children:\s*(.+)$", cleaned, re.IGNORECASE)
    if adults_children:
        adult_range, child_range = adults_children.groups()
        if age_years is not None and age_years < 18:
            return child_range.strip()
        return adult_range.strip()

    sex_parenthetical = re.match(r"^(.+?)\s*\(F\),\s*(.+?)\s*\(M\)$", cleaned, re.IGNORECASE)
    if sex_parenthetical and normalized_sex:
        female_range, male_range = sex_parenthetical.groups()
        return female_range.strip() if normalized_sex == "F" else male_range.strip()

    sex_slash = re.match(r"^(.+?)\s+F\s*/\s*(.+?)\s+M$", cleaned, re.IGNORECASE)
    if sex_slash and normalized_sex:
        female_range, male_range = sex_slash.groups()
        return female_range.strip() if normalized_sex == "F" else male_range.strip()

    sex_slash_reversed = re.match(r"^(.+?)\s+M\s*/\s*(.+?)\s+F$", cleaned, re.IGNORECASE)
    if sex_slash_reversed and normalized_sex:
        male_range, female_range = sex_slash_reversed.groups()
        return female_range.strip() if normalized_sex == "F" else male_range.strip()

    return cleaned




def build_reference_range_rows(reference_range_text: str | None, unit: str | None, method_name: str | None, critical_low: Decimal | None = None, critical_high: Decimal | None = None) -> list[dict]:
    if not reference_range_text:
        return [{
            "sex": None,
            "min_age_years": None,
            "max_age_years": None,
            "unit": unit,
            "reference_range_text": None,
            "method_name": method_name,
            "critical_low": critical_low,
            "critical_high": critical_high,
            "is_default": True,
        }]

    cleaned = reference_range_text.strip()
    rows: list[dict] = []

    adults_children = re.match(r"^Adults:\s*(.+?)\s*/\s*Children:\s*(.+)$", cleaned, re.IGNORECASE)
    if adults_children:
        adult_range, child_range = adults_children.groups()
        rows.append({
            "sex": None,
            "min_age_years": 18,
            "max_age_years": None,
            "unit": unit,
            "reference_range_text": adult_range.strip(),
            "method_name": method_name,
            "critical_low": critical_low,
            "critical_high": critical_high,
            "is_default": False,
        })
        rows.append({
            "sex": None,
            "min_age_years": None,
            "max_age_years": 17,
            "unit": unit,
            "reference_range_text": child_range.strip(),
            "method_name": method_name,
            "critical_low": critical_low,
            "critical_high": critical_high,
            "is_default": False,
        })
        return rows

    parenthetical = re.match(r"^(.+?)\s*\(F\),\s*(.+?)\s*\(M\)$", cleaned, re.IGNORECASE)
    if parenthetical:
        female_range, male_range = parenthetical.groups()
        return [
            {"sex": SexType.FEMALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": female_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
            {"sex": SexType.MALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": male_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
        ]

    female_male = re.match(r"^(.+?)\s+F\s*/\s*(.+?)\s+M$", cleaned, re.IGNORECASE)
    if female_male:
        female_range, male_range = female_male.groups()
        return [
            {"sex": SexType.FEMALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": female_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
            {"sex": SexType.MALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": male_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
        ]

    male_female = re.match(r"^(.+?)\s+M\s*/\s*(.+?)\s+F$", cleaned, re.IGNORECASE)
    if male_female:
        male_range, female_range = male_female.groups()
        return [
            {"sex": SexType.FEMALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": female_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
            {"sex": SexType.MALE, "min_age_years": None, "max_age_years": None, "unit": unit, "reference_range_text": male_range.strip(), "method_name": method_name, "critical_low": critical_low, "critical_high": critical_high, "is_default": False},
        ]

    return [{
        "sex": None,
        "min_age_years": None,
        "max_age_years": None,
        "unit": unit,
        "reference_range_text": cleaned,
        "method_name": method_name,
        "critical_low": critical_low,
        "critical_high": critical_high,
        "is_default": True,
    }]
