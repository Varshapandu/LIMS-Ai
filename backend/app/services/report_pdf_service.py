from __future__ import annotations

from datetime import datetime


class ReportPdfService:
    @staticmethod
    def build_report_pdf_bytes(
        *,
        report_number: str,
        visit_number: str,
        patient_name: str,
        patient_email: str | None,
        generated_at: datetime | None,
        doctor_note: str | None,
        analytes: list[dict[str, str]],
    ) -> bytes:
        issued_on = (
            generated_at.strftime("%d %b %Y %H:%M")
            if generated_at
            else datetime.utcnow().strftime("%d %b %Y %H:%M")
        )
        lines = [
            "AI LIMS FINAL LAB REPORT",
            "",
            f"Report Number: {report_number}",
            f"Visit Number: {visit_number}",
            f"Patient Name: {patient_name}",
            f"Patient Email: {patient_email or 'Not available'}",
            f"Issued On: {issued_on}",
            "",
            "Results:",
        ]
        for index, analyte in enumerate(analytes, start=1):
            lines.append(
                f"{index}. {analyte['test_name']} | Result: {analyte['result_value']} | Ref: {analyte['reference_range']}"
            )
        lines.extend(
            [
                "",
                "Doctor Note:",
                doctor_note.strip() if doctor_note and doctor_note.strip() else "No additional clinical assessment provided.",
            ]
        )
        return ReportPdfService._render_text_pdf(lines)

    @staticmethod
    def _render_text_pdf(lines: list[str]) -> bytes:
        max_lines_per_page = 44
        pages = [lines[i : i + max_lines_per_page] for i in range(0, len(lines), max_lines_per_page)] or [[]]

        objects: list[bytes] = []

        def add_object(content: str | bytes) -> int:
            data = content.encode("latin-1", errors="replace") if isinstance(content, str) else content
            objects.append(data)
            return len(objects)

        font_object = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        page_object_ids: list[int] = []

        for page_lines in pages:
            content_lines = ["BT", "/F1 10 Tf", "50 792 Td", "14 TL"]
            for line_index, line in enumerate(page_lines):
                escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                if line_index == 0:
                    content_lines.append(f"({escaped}) Tj")
                else:
                    content_lines.append("T*")
                    content_lines.append(f"({escaped}) Tj")
            content_lines.append("ET")
            stream = "\n".join(content_lines).encode("latin-1", errors="replace")
            content_object = add_object(
                b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
            )
            page_object = add_object(
                f"<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_object} 0 R >> >> /Contents {content_object} 0 R >>"
            )
            page_object_ids.append(page_object)

        kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
        pages_object = add_object(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>")
        catalog_object = add_object(f"<< /Type /Catalog /Pages {pages_object} 0 R >>")

        resolved_objects: list[bytes] = []
        for obj in objects:
            if b"PAGES_REF" in obj:
                obj = obj.replace(b"PAGES_REF", f"{pages_object} 0 R".encode("ascii"))
            resolved_objects.append(obj)

        pdf = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for index, obj in enumerate(resolved_objects, start=1):
            offsets.append(len(pdf))
            pdf.extend(f"{index} 0 obj\n".encode("ascii"))
            pdf.extend(obj)
            pdf.extend(b"\nendobj\n")

        xref_offset = len(pdf)
        pdf.extend(f"xref\n0 {len(resolved_objects) + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        pdf.extend(
            (
                f"trailer\n<< /Size {len(resolved_objects) + 1} /Root {catalog_object} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF"
            ).encode("ascii")
        )
        return bytes(pdf)
