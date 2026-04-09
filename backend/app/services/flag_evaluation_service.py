"""Flag evaluation service — stateless, pure-function logic for determining
abnormal / critical flags on lab results and deriving approval-screen status
labels.

Extracted from ``ResultService`` to isolate clinical decision rules from
database operations.  Every function in this module is a ``@staticmethod``
with **no** database dependency, making the logic trivially unit-testable.
"""

from __future__ import annotations

from decimal import Decimal

from app.models.models import TestCatalog


class FlagEvaluationService:
    """Pure-function helpers for result flag evaluation."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def evaluate_flags(
        test: TestCatalog,
        numeric_value: Decimal | None,
        result_text: str | None,
    ) -> tuple[str | None, bool]:
        """Return ``(abnormal_flag, critical_flag)`` for a given result.

        Delegates to :meth:`_evaluate_qualitative_flag` when no numeric
        value is present.
        """
        if numeric_value is None:
            return FlagEvaluationService._evaluate_qualitative_flag(
                test.reference_range_text, result_text
            )

        critical_flag = False
        abnormal_flag = None

        if test.critical_low is not None and numeric_value <= test.critical_low:
            abnormal_flag = "LOW"
            critical_flag = True
        elif test.critical_high is not None and numeric_value >= test.critical_high:
            abnormal_flag = "HIGH"
            critical_flag = True

        return abnormal_flag, critical_flag

    @staticmethod
    def approval_status_for_row(
        test_name: str,
        numeric_value: Decimal | None,
        result_text: str | None,
        abnormal_flag: str | None,
        critical_flag: bool,
    ) -> tuple[str, str]:
        """Derive a human-readable ``(status_label, status_tone)`` pair.

        Uses hardcoded clinical rules (HbA1c ≥ 6.5, Sodium ≥ 150, …).
        These are candidates for a future database-driven rules engine.
        """
        test_key = test_name.lower()

        if numeric_value is None and not (result_text and result_text.strip()) and not abnormal_flag:
            return "Pending", "pending"

        if "hba1c" in test_key and numeric_value is not None and numeric_value >= Decimal("6.5"):
            return "Uncontrolled", "critical"
        if "sodium" in test_key and numeric_value is not None and numeric_value >= Decimal("150"):
            return "Severe", "critical"

        if critical_flag and abnormal_flag == "LOW":
            return "Critical Low", "critical"
        if critical_flag and abnormal_flag == "HIGH":
            return "Critical High", "critical"
        if critical_flag and abnormal_flag == "POSITIVE":
            return "Critical Positive", "critical"
        if critical_flag:
            return "Critical Abnormal", "critical"
        if abnormal_flag == "HIGH":
            return "High", "critical"
        if abnormal_flag == "LOW":
            return "Low", "critical"

        return "Normal", "normal"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_qualitative_text(value: str) -> str:
        return " ".join(
            value.lower()
            .replace("(", " ")
            .replace(")", " ")
            .replace("/", " ")
            .replace("-", " ")
            .split()
        )

    @staticmethod
    def _evaluate_qualitative_flag(
        reference_range_text: str | None,
        result_text: str | None,
    ) -> tuple[str | None, bool]:
        if not reference_range_text or not result_text or not result_text.strip():
            return None, False

        normalize = FlagEvaluationService._normalize_qualitative_text
        normalized_range = normalize(reference_range_text)
        normalized_value = normalize(result_text)

        negative_markers = [
            "negative",
            "non reactive",
            "nonreactive",
            "no growth",
            "no pathogen isolated",
            "not detected",
            "absent",
            "normal morphology",
        ]

        if not any(marker in normalized_range for marker in negative_markers):
            return None, False

        if any(marker in normalized_value for marker in negative_markers + ["normal"]):
            return None, False

        positive_markers = [
            "positive",
            "reactive",
            "detected",
            "present",
            "growth",
            "pathogen isolated",
            "seen",
        ]
        if any(marker in normalized_value for marker in positive_markers):
            return "POSITIVE", True

        return "ABNORMAL", True
