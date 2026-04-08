function normalize(value: string) {
  return value.toLowerCase().replace(/[/-]/g, " ").replace(/\s+/g, " ").trim();
}

function containsAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
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
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) {
    return null;
  }

  return { low, high };
}

function inferQualitativeFlag(resultValue: string, referenceRangeText: string) {
  const normalizedValue = normalize(resultValue);
  const normalizedReference = normalize(referenceRangeText);

  if (!normalizedValue || !normalizedReference) {
    return null;
  }

  if (normalizedReference === "not configured" || normalizedReference === "pending") {
    return null;
  }

  if (normalizedReference.includes(normalizedValue) || normalizedValue.includes(normalizedReference)) {
    return null;
  }

  const positiveLike = containsAnyTerm(normalizedValue, [
    "positive",
    "reactive",
    "detected",
    "present",
    "growth",
    "pathogen isolated",
    "seen",
  ]);

  if (positiveLike) {
    return "POSITIVE";
  }

  return "ABNORMAL";
}

export function deriveAbnormalFlag(input: {
  numericValue?: string | null;
  resultText?: string | null;
  abnormalFlag?: string | null;
  referenceRangeText?: string | null;
}) {
  if (input.abnormalFlag) {
    return input.abnormalFlag;
  }

  const bounds = parseNumericBounds(input.referenceRangeText);
  const numericValue = input.numericValue ? Number(input.numericValue) : Number.NaN;

  if (bounds && Number.isFinite(numericValue)) {
    if (numericValue < bounds.low) {
      return "LOW";
    }
    if (numericValue > bounds.high) {
      return "HIGH";
    }
    return null;
  }

  if (input.resultText && input.referenceRangeText) {
    return inferQualitativeFlag(input.resultText, input.referenceRangeText);
  }

  return null;
}
