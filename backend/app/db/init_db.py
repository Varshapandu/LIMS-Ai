from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from datetime import datetime, timedelta, timezone

from app.models.models import Department, Invoice, OrderHeader, OrderTest, Patient, ReferenceRange, ResultRecord, ResultStatus, Role, ServiceCategory, SexType, Specimen, SpecimenStatus, TestCatalog, User, Visit, VisitStatus
from app.db.test_reference_data import build_reference_range_rows, get_test_metadata

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BIO_ANALYTES = [
    "Albumin", "Alkaline Phosphatase", "ALT", "Ammonia", "Amylase", "Apolipoprotein A1", "Apolipoprotein B",
    "AST", "Bicarbonate", "Bilirubin Direct", "Bilirubin Total", "Blood Urea Nitrogen", "Calcium",
    "Chloride", "Cholesterol Total", "CK Total", "Cortisol", "Creatinine", "C Reactive Protein",
    "D Dimer", "Ferritin", "Folate", "Free T3", "Free T4", "Fructosamine", "Gamma GT", "Glucose",
    "HDL Cholesterol", "Homocysteine", "Insulin", "Iron", "LDH", "LDL Cholesterol", "Lipase",
    "Magnesium", "Manganese", "Metanephrine", "Microalbumin", "Myoglobin", "Phosphorus", "Potassium",
    "Procalcitonin", "Protein Total", "Sodium", "Transferrin", "Triglycerides", "Troponin I", "Troponin T",
    "TSH", "Uric Acid", "Vitamin B12", "Vitamin D"
]
BIO_VARIANTS = [
    "Serum", "Plasma", "Fasting", "Random", "Post Prandial", "Panel", "Extended Panel", "Urine",
    "24 Hour Urine", "STAT", "Baseline", "Follow Up"
]

HEM_ANALYTES = [
    "Absolute Basophil Count", "Absolute Eosinophil Count", "Absolute Lymphocyte Count", "Absolute Monocyte Count",
    "Absolute Neutrophil Count", "Basophil Count", "Bleeding Time", "Blood Grouping", "Clotting Time",
    "Complete Blood Count", "Differential Count", "Eosinophil Count", "Erythrocyte Sedimentation Rate",
    "Fibrinogen", "Hematocrit", "Hemoglobin", "Leukocyte Count", "Lymphocyte Count", "MCH", "MCHC",
    "MCV", "Mean Platelet Volume", "Monocyte Count", "Packed Cell Volume", "Peripheral Smear", "Platelet Count",
    "Prothrombin Time", "Reticulocyte Count", "RBC Count", "Red Cell Distribution Width", "Sickle Cell Screen",
    "Thrombin Time", "Total Leukocyte Count", "WBC Count", "Activated Partial Thromboplastin Time"
]
HEM_VARIANTS = [
    "Automated", "Manual Differential", "Peripheral Smear", "Baseline", "Follow Up", "EDTA", "Screening",
    "STAT", "Pre Operative", "Extended", "Retic", "Profile"
]

MIC_ANALYTES = [
    "Acid Fast Bacilli", "Anaerobic Culture", "Blood Culture", "Candida Panel", "Clostridium difficile",
    "COVID 19", "CSF Culture", "Dengue Antigen", "Dengue Antibody", "Fungal Culture", "Gene Panel",
    "Hepatitis B Surface Antigen", "Hepatitis C Antibody", "HIV Screen", "Influenza A B", "Malaria Antigen",
    "Microbial Identification", "MRSA Screen", "Respiratory Pathogen", "Salmonella Typhi", "Sputum Culture",
    "Stool Culture", "TB PCR", "Throat Swab Culture", "Typhoid IgM", "Urine Culture"
]
MIC_VARIANTS = [
    "Culture", "PCR", "Antigen", "Antibody", "Rapid", "Panel", "Screening", "Confirmatory",
    "Surveillance", "Baseline", "Follow Up", "Multiplex"
]

RADIOLOGY_SERVICES = [
    ("RAD001", "MRI Brain", "Imaging Suite", "MRI Console", 45, 4200),
    ("RAD002", "MRI Cervical Spine", "Imaging Suite", "MRI Console", 50, 4300),
    ("RAD003", "MRI Knee", "Imaging Suite", "MRI Console", 40, 3900),
    ("RAD004", "CT Brain", "Imaging Suite", "CT Scanner", 30, 3200),
    ("RAD005", "CT Abdomen", "Imaging Suite", "CT Scanner", 35, 3600),
    ("RAD006", "CT Chest HRCT", "Imaging Suite", "CT Scanner", 35, 4100),
    ("RAD007", "X-Ray Chest PA", "Imaging Suite", "Digital X-Ray", 20, 650),
    ("RAD008", "X-Ray Knee AP/LAT", "Imaging Suite", "Digital X-Ray", 20, 700),
    ("RAD009", "Ultrasound Abdomen", "Ultrasound Suite", "USG Console", 25, 1800),
    ("RAD010", "Ultrasound Pelvis", "Ultrasound Suite", "USG Console", 25, 1750),
    ("RAD011", "Mammography Screening", "Imaging Suite", "Mammography Unit", 25, 2200),
    ("RAD012", "Dexa Scan", "Imaging Suite", "Dexa Scanner", 20, 2000),
]

CARDIOLOGY_SERVICES = [
    ("CAR001", "ECG Resting", "Cardiac Diagnostics", "ECG Machine", 15, 450),
    ("CAR002", "2D Echo", "Cardiac Diagnostics", "Echo Console", 30, 2200),
    ("CAR003", "TMT Stress Test", "Cardiac Diagnostics", "Treadmill", 35, 2600),
    ("CAR004", "Holter Monitoring 24H", "Cardiac Diagnostics", "Holter Device", 40, 3200),
    ("CAR005", "Ambulatory Blood Pressure Monitoring", "Cardiac Diagnostics", "ABPM Device", 35, 1800),
]


def _generate_catalog_rows(department_map: dict[str, Department]) -> list[TestCatalog]:
    rows: list[TestCatalog] = []

    def add_generated_rows(prefix: str, department_code: str, analytes: list[str], variants: list[str], sample_type: str, container_type: str, base_price: int, unit: str | None = None) -> None:
        department_id = department_map[department_code].id
        for analyte_index, analyte in enumerate(analytes, start=1):
            for variant_index, variant in enumerate(variants, start=1):
                code = f"{prefix}{analyte_index:02d}{variant_index:02d}"
                test_name = f"{analyte} {variant}"
                metadata = get_test_metadata(test_name, "laboratory")
                rows.append(
                    TestCatalog(
                        id=str(uuid4()),
                        department_id=department_id,
                        test_code=code,
                        test_name=test_name,
                        short_name=analyte[:30],
                        sample_type=sample_type,
                        container_type=container_type,
                        method_name=metadata.method_name,
                        turnaround_minutes=180 + (variant_index * 15),
                        price=Decimal(str(base_price + analyte_index + variant_index * 5)),
                        unit=metadata.unit if metadata.unit is not None else unit,
                        reference_range_text=metadata.reference_range_text,
                        critical_low=metadata.critical_low,
                        critical_high=metadata.critical_high,
                        barcode_prefix=prefix,
                    )
                )

    add_generated_rows("BIO", "BIO", BIO_ANALYTES, BIO_VARIANTS, "Serum", "Plain / Gel", 180, "mg/dL")
    add_generated_rows("HEM", "HEM", HEM_ANALYTES, HEM_VARIANTS, "Whole Blood", "EDTA", 220, None)
    add_generated_rows("MIC", "MIC", MIC_ANALYTES, MIC_VARIANTS, "Swab / Fluid", "Sterile Container", 260, None)

    for test_code, test_name, sample_type, container_type, turnaround_minutes, price in RADIOLOGY_SERVICES:
        metadata = get_test_metadata(test_name, "radiology")
        rows.append(
            TestCatalog(
                id=str(uuid4()),
                department_id=department_map["BIO"].id,
                service_category=ServiceCategory.RADIOLOGY,
                test_code=test_code,
                test_name=test_name,
                short_name=test_name[:30],
                sample_type=sample_type,
                container_type=container_type,
                method_name=metadata.method_name,
                turnaround_minutes=turnaround_minutes,
                price=Decimal(str(price)),
                unit=metadata.unit,
                reference_range_text=metadata.reference_range_text,
                critical_low=metadata.critical_low,
                critical_high=metadata.critical_high,
                barcode_prefix="RAD",
            )
        )

    for test_code, test_name, sample_type, container_type, turnaround_minutes, price in CARDIOLOGY_SERVICES:
        metadata = get_test_metadata(test_name, "cardiology")
        rows.append(
            TestCatalog(
                id=str(uuid4()),
                department_id=department_map["BIO"].id,
                service_category=ServiceCategory.CARDIOLOGY,
                test_code=test_code,
                test_name=test_name,
                short_name=test_name[:30],
                sample_type=sample_type,
                container_type=container_type,
                method_name=metadata.method_name,
                turnaround_minutes=turnaround_minutes,
                price=Decimal(str(price)),
                unit=metadata.unit,
                reference_range_text=metadata.reference_range_text,
                critical_low=metadata.critical_low,
                critical_high=metadata.critical_high,
                barcode_prefix="CAR",
            )
        )

    return rows


def _sync_reference_ranges(db: Session) -> None:
    db.query(ReferenceRange).delete()
    db.flush()

    for stored_test in db.query(TestCatalog).all():
        metadata = get_test_metadata(stored_test.test_name, stored_test.service_category.value if getattr(stored_test, "service_category", None) else "laboratory")
        for row in build_reference_range_rows(
            metadata.reference_range_text,
            metadata.unit,
            metadata.method_name,
            metadata.critical_low,
            metadata.critical_high,
        ):
            db.add(
                ReferenceRange(
                    id=str(uuid4()),
                    test_id=stored_test.id,
                    sex=row["sex"],
                    min_age_years=row["min_age_years"],
                    max_age_years=row["max_age_years"],
                    unit=row["unit"],
                    reference_range_text=row["reference_range_text"],
                    method_name=row["method_name"],
                    critical_low=row["critical_low"],
                    critical_high=row["critical_high"],
                    is_default=row["is_default"],
                )
            )


def _create_sample_data(db: Session, admin_user_id: str) -> None:
    """Create sample patients, visits, and specimens for demo purposes."""
    if db.query(Patient).first():
        return  # Sample data already exists

    # Sample patient data
    patients_data = [
        ("Julianne V. Sterling", "PID-88429-X", "1978-05-15", "female"),
        ("Arthur M. Penhaligon", "PID-11023-A", "1962-11-22", "male"),
        ("Elara Vance", "PID-44910-K", "1995-03-08", "female"),
        ("Robert Chen", "PID-33291-M", "1971-07-19", "male"),
        ("Emma Thompson", "PID-55821-Z", "1988-09-14", "female"),
    ]

    patients = []
    for full_name, patient_code, dob, sex in patients_data:
        patient = Patient(
            id=str(uuid4()),
            patient_code=patient_code,
            first_name=full_name.split()[0],
            last_name=" ".join(full_name.split()[1:]),
            full_name=full_name,
            date_of_birth=datetime.strptime(dob, "%Y-%m-%d").date(),
            sex=SexType(sex),
            mobile_number="9999999999",
            email=f"{full_name.lower().replace(' ', '.')}@example.com",
        )
        db.add(patient)
        patients.append(patient)
    
    db.flush()

    # Get sample tests
    tests = db.query(TestCatalog).filter(TestCatalog.test_code.in_(["GLU", "CBC", "HBA1C"])).all()
    test_map = {test.test_code: test for test in tests}

    # Create visits and orders
    now = datetime.now(timezone.utc)
    for idx, patient in enumerate(patients, start=1):
        visit_number = f"VIS-{2025}{str(idx).zfill(4)}"
        visit = Visit(
            id=str(uuid4()),
            patient_id=patient.id,
            visit_number=visit_number,
            visit_type="op",
            visit_status=VisitStatus.BILLED,
            clinical_notes="Routine checkup",
        )
        db.add(visit)
        db.flush()

        # Create invoice
        invoice = Invoice(
            id=str(uuid4()),
            visit_id=visit.id,
            invoice_number=f"INV-{2025}{str(idx).zfill(4)}",
            gross_amount=Decimal("1500.00"),
            discount_amount=Decimal("0.00"),
            tax_amount=Decimal("270.00"),
            net_amount=Decimal("1770.00"),
        )
        db.add(invoice)
        db.flush()

        # Create order header
        order_header = OrderHeader(
            id=str(uuid4()),
            visit_id=visit.id,
            patient_id=patient.id,
            order_number=f"ORD-{2025}{str(idx).zfill(4)}",
            ordered_by=admin_user_id,
            status=VisitStatus.BILLED,
        )
        db.add(order_header)
        db.flush()

        # Create order tests and specimens
        selected_tests = [tests[idx % len(tests)] for idx in range(2)]
        for test_idx, test in enumerate(selected_tests, start=1):
            barcode = f"BC-{str(uuid4())[:8].upper()}"
            order_test = OrderTest(
                id=str(uuid4()),
                order_id=order_header.id,
                visit_id=visit.id,
                patient_id=patient.id,
                test_id=test.id,
                barcode_value=barcode,
                sample_type=test.sample_type,
                container_type=test.container_type,
                priority="stat" if test_idx == 1 else "normal",
                tat_due_at=now + timedelta(minutes=test.turnaround_minutes),
                order_status=VisitStatus.BILLED,
            )
            db.add(order_test)
            db.flush()

            # Create specimen
            specimen = Specimen(
                id=str(uuid4()),
                order_test_id=order_test.id,
                specimen_number=f"SPE-{str(uuid4())[:8].upper()}",
                specimen_status=SpecimenStatus.PENDING if test_idx % 2 == 0 else SpecimenStatus.COLLECTED,
            )
            db.add(specimen)
    
    db.commit()


def _ensure_doctor_approval_case(db: Session, department_map: dict[str, Department], doctor_user_id: str) -> None:
    existing_visit = db.query(Visit).filter(Visit.visit_number == "LIMS-98422").first()
    if existing_visit:
        return

    patient = db.query(Patient).filter(Patient.patient_code == "PID-98422-EV").first()
    if not patient:
        patient = Patient(
            id=str(uuid4()),
            patient_code="PID-98422-EV",
            first_name="Eleanor",
            last_name="Vance",
            full_name="Eleanor Vance",
            age_years=54,
            sex=SexType.FEMALE,
            mobile_number="9999999999",
            email="eleanor.vance@example.com",
        )
        db.add(patient)
        db.flush()

    demo_tests = [
        {
            "test_code": "GLU",
            "test_name": "Glucose, Fasting",
            "sample_type": "Serum",
            "container_type": "Grey Top",
            "unit": "mg/dL",
            "reference_range_text": "70 - 99",
            "critical_low": Decimal("55"),
            "critical_high": Decimal("240"),
            "result_value": Decimal("248"),
            "abnormal_flag": "HIGH",
            "critical_flag": True,
            "method_name": "Hexokinase/UV",
        },
        {
            "test_code": "CREA",
            "test_name": "Creatinine",
            "sample_type": "Serum",
            "container_type": "Plain / Gel",
            "unit": "mg/dL",
            "reference_range_text": "0.7 - 1.3",
            "critical_low": Decimal("0.4"),
            "critical_high": Decimal("1.9"),
            "result_value": Decimal("0.9"),
            "abnormal_flag": None,
            "critical_flag": False,
            "method_name": "Enzymatic",
        },
        {
            "test_code": "HBA1C",
            "test_name": "HbA1c",
            "sample_type": "Whole Blood",
            "container_type": "EDTA",
            "unit": "%",
            "reference_range_text": "< 5.7",
            "critical_low": None,
            "critical_high": Decimal("8.5"),
            "result_value": Decimal("9.4"),
            "abnormal_flag": "HIGH",
            "critical_flag": True,
            "method_name": "HPLC",
        },
        {
            "test_code": "SOD",
            "test_name": "Sodium",
            "sample_type": "Serum",
            "container_type": "Plain / Gel",
            "unit": "mEq/L",
            "reference_range_text": "135 - 145",
            "critical_low": Decimal("128"),
            "critical_high": Decimal("150"),
            "result_value": Decimal("152"),
            "abnormal_flag": "HIGH",
            "critical_flag": True,
            "method_name": "Potentiometry",
        },
    ]

    test_rows: list[TestCatalog] = []
    for item in demo_tests:
        test = db.query(TestCatalog).filter(TestCatalog.test_code == item["test_code"]).first()
        if not test:
            test = TestCatalog(
                id=str(uuid4()),
                department_id=department_map["BIO"].id,
                test_code=item["test_code"],
                test_name=item["test_name"],
                sample_type=item["sample_type"],
                container_type=item["container_type"],
                turnaround_minutes=180,
                price=Decimal("350.00"),
                unit=item["unit"],
                reference_range_text=item["reference_range_text"],
                critical_low=item["critical_low"],
                critical_high=item["critical_high"],
                barcode_prefix=item["test_code"],
                method_name=item["method_name"],
            )
            db.add(test)
            db.flush()
        else:
            test.test_name = item["test_name"]
            test.sample_type = item["sample_type"]
            test.container_type = item["container_type"]
            test.unit = item["unit"]
            test.reference_range_text = item["reference_range_text"]
            test.critical_low = item["critical_low"]
            test.critical_high = item["critical_high"]
            test.method_name = item["method_name"]
        test_rows.append(test)

    visit = Visit(
        id=str(uuid4()),
        patient_id=patient.id,
        created_by=doctor_user_id,
        visit_number="LIMS-98422",
        visit_type="op",
        visit_status=VisitStatus.PROCESSING,
        clinical_notes='Patient reporting persistent fatigue and blurred vision over the last 72 hours. Last HbA1c: 8.2%.',
        symptoms_text="Metformin 500mg BID",
        provisional_diagnosis="Type II Diabetes Mellitus",
    )
    db.add(visit)
    db.flush()

    invoice = Invoice(
        id=str(uuid4()),
        visit_id=visit.id,
        invoice_number="INV-98422",
        gross_amount=Decimal("2250.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        net_amount=Decimal("2250.00"),
    )
    db.add(invoice)
    db.flush()

    order_header = OrderHeader(
        id=str(uuid4()),
        visit_id=visit.id,
        patient_id=patient.id,
        order_number="ORD-98422",
        ordered_by=doctor_user_id,
        status=VisitStatus.PROCESSING,
    )
    db.add(order_header)
    db.flush()

    collected_at = datetime.now(timezone.utc) - timedelta(hours=2, minutes=45)
    received_at = collected_at + timedelta(minutes=15)
    verified_at = received_at + timedelta(hours=2, minutes=5)

    for index, (test, item) in enumerate(zip(test_rows, demo_tests, strict=False), start=1):
        order_test = OrderTest(
            id=str(uuid4()),
            order_id=order_header.id,
            visit_id=visit.id,
            patient_id=patient.id,
            test_id=test.id,
            barcode_value=f"{item['test_code']}-98422-{index}",
            sample_type=test.sample_type,
            container_type=test.container_type,
            priority="stat" if index == 1 else "normal",
            tat_due_at=received_at + timedelta(minutes=test.turnaround_minutes),
            order_status=VisitStatus.PROCESSING,
            result_status=ResultStatus.VERIFIED,
        )
        db.add(order_test)
        db.flush()

        specimen = Specimen(
            id=str(uuid4()),
            order_test_id=order_test.id,
            specimen_number=f"SPE-98422-{index}",
            specimen_status=SpecimenStatus.RECEIVED,
            collected_at=collected_at,
            received_at=received_at,
        )
        db.add(specimen)
        db.flush()

        result_record = ResultRecord(
            id=str(uuid4()),
            order_test_id=order_test.id,
            specimen_id=specimen.id,
            verified_by=doctor_user_id,
            entered_by=doctor_user_id,
            result_status=ResultStatus.VERIFIED,
            numeric_value=item["result_value"],
            unit=item["unit"],
            reference_range_text=item["reference_range_text"],
            abnormal_flag=item["abnormal_flag"],
            critical_flag=item["critical_flag"],
            entered_at=received_at + timedelta(hours=1),
            verified_at=verified_at,
            comments="Electronic signature enabled",
        )
        db.add(result_record)

    db.commit()




def init_reference_data(db: Session) -> None:
    if not db.query(Role).first():
        roles = [
            Role(id=str(uuid4()), code="admin", name="Admin"),
            Role(id=str(uuid4()), code="lab_technician", name="Lab Technician"),
            Role(id=str(uuid4()), code="doctor", name="Doctor"),
        ]
        db.add_all(roles)
        db.flush()
    else:
        roles = db.query(Role).all()

    role_map = {role.code: role for role in roles}

    if not db.query(Department).first():
        departments = [
            Department(id=str(uuid4()), code="BIO", name="Biochemistry", display_order=1),
            Department(id=str(uuid4()), code="HEM", name="Hematology", display_order=2),
            Department(id=str(uuid4()), code="MIC", name="Microbiology", display_order=3),
        ]
        db.add_all(departments)
        db.flush()
    else:
        departments = db.query(Department).all()

    department_map = {department.code: department for department in departments}

    admin_user_id = None
    if not db.query(User).filter(User.email == "admin@ailims.com").first():
        admin_user = User(
            id=str(uuid4()),
            role_id=role_map["admin"].id,
            department_id=department_map["BIO"].id,
            employee_code="EMP-ADMIN-001",
            full_name="Dr. Alistair Thorne",
            email="admin@ailims.com",
            phone="9999999999",
            password_hash=pwd_context.hash("admin123"),
        )
        db.add(admin_user)
        db.flush()
        admin_user_id = admin_user.id
    else:
        admin_user = db.query(User).filter(User.email == "admin@ailims.com").first()
        admin_user_id = admin_user.id

    existing_codes = {code for (code,) in db.query(TestCatalog.test_code).all()}
    base_tests = [
        TestCatalog(
            id=str(uuid4()),
            department_id=department_map["BIO"].id,
            test_code="GLU",
            test_name="Glucose Fasting",
            sample_type="Serum",
            container_type="Grey Top",
            turnaround_minutes=240,
            price=Decimal("220"),
            unit="mg/dL",
            reference_range_text="70 - 99",
            barcode_prefix="GLU",
        ),
        TestCatalog(
            id=str(uuid4()),
            department_id=department_map["HEM"].id,
            test_code="CBC",
            test_name="Complete Blood Count",
            sample_type="Whole Blood",
            container_type="EDTA",
            turnaround_minutes=360,
            price=Decimal("450"),
            barcode_prefix="CBC",
        ),
        TestCatalog(
            id=str(uuid4()),
            department_id=department_map["BIO"].id,
            test_code="HBA1C",
            test_name="HbA1c",
            sample_type="Whole Blood",
            container_type="EDTA",
            turnaround_minutes=480,
            price=Decimal("650"),
            unit="%",
            reference_range_text="4.0 - 5.6",
            barcode_prefix="HBA1C",
        ),
    ]

    for test in base_tests:
        if test.test_code not in existing_codes:
            db.add(test)
            existing_codes.add(test.test_code)

    for generated_test in _generate_catalog_rows(department_map):
        if generated_test.test_code not in existing_codes:
            db.add(generated_test)
            existing_codes.add(generated_test.test_code)

    for stored_test in db.query(TestCatalog).all():
        metadata = get_test_metadata(stored_test.test_name, stored_test.service_category.value if getattr(stored_test, "service_category", None) else "laboratory")
        stored_test.method_name = metadata.method_name
        stored_test.unit = metadata.unit
        stored_test.reference_range_text = metadata.reference_range_text
        stored_test.critical_low = metadata.critical_low
        stored_test.critical_high = metadata.critical_high

    _sync_reference_ranges(db)
    db.commit()
    
    # Create sample data for demo
    _create_sample_data(db, admin_user_id)
    _ensure_doctor_approval_case(db, department_map, admin_user_id)

