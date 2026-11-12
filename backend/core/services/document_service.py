from __future__ import annotations

import re
from pathlib import Path

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


class DocumentProcessingService:
    """Handles secure upload validation, extraction, and clause-based chunking."""

    @staticmethod
    def validate_uploaded_file(file_obj) -> None:
        if file_obj is None:
            raise ValueError("No file was provided.")

        name = Path(file_obj.name or "").name
        extension = Path(name).suffix.lower()

        if extension not in ALLOWED_EXTENSIONS:
            raise ValueError("Unsupported file type. Upload a PDF document.")

        if file_obj.size > MAX_FILE_SIZE_BYTES:
            raise ValueError("File is too large. Maximum size is 10MB.")

        file_obj.seek(0)
        signature = file_obj.read(5)
        file_obj.seek(0)
        if signature != b"%PDF-":
            raise ValueError("The uploaded file is not a valid PDF.")

    @staticmethod
    def detect_document_type(file_name: str) -> str:
        filename = (file_name or "").lower()
        if "contract" in filename:
            return "contract"
        if "pod" in filename or "proof" in filename:
            return "pod"
        if "lr" in filename or "load" in filename:
            return "lr"
        if "claim" in filename:
            return "claim"
        return "other"

    @staticmethod
    def extract_text_from_uploaded_file(file_obj) -> str:
        if file_obj is None:
            return ""

        file_obj.seek(0)
        content = file_obj.read()
        extension = Path(file_obj.name or "").suffix.lower()

        if extension == ".pdf":
            return DocumentProcessingService._extract_pdf_text(content)
        raise ValueError("Unsupported file type. Upload a PDF document.")

    @staticmethod
    def _extract_pdf_text(content: bytes) -> str:
        if pymupdf is None:
            raise RuntimeError("PDF extraction is unavailable. Install the PyMuPDF dependency.")

        try:
            with pymupdf.open(stream=content, filetype="pdf") as document:
                text = "\n".join(page.get_text("text") for page in document).strip()
        except Exception as exc:
            raise ValueError("The uploaded PDF could not be read.") from exc

        if not text:
            raise ValueError("No selectable text was found. Scanned-PDF OCR is not configured.")
        return text

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 900) -> list[str]:
        raw_text = (text or "").strip()
        if not raw_text:
            return []

        normalized = re.sub(r"\s+", " ", raw_text)
        sections = re.split(r"(?=(?:Clause|Section|Article|Item)\s+[A-Za-z0-9.:-]+)", normalized)
        if len(sections) <= 1:
            sections = re.split(r"(?<=[.!?])\s+", normalized)

        chunks: list[str] = []
        current = ""

        for section in sections:
            candidate = (current + " " + section).strip()
            if not candidate:
                continue
            if len(candidate) <= chunk_size:
                current = candidate
                continue

            if current.strip():
                chunks.append(current.strip())

            words = candidate.split()
            current = ""
            for word in words:
                next_text = (current + " " + word).strip()
                if len(next_text) <= chunk_size:
                    current = next_text
                else:
                    if current.strip():
                        chunks.append(current.strip())
                    current = word

            if current.strip():
                chunks.append(current.strip())
            current = ""

        if current.strip():
            chunks.append(current.strip())

        return [chunk for chunk in chunks if chunk.strip()]

    @staticmethod
    def store_chunks(document, chunks: list[str]) -> None:
        from ..models import DocumentChunk

        document.chunks.all().delete()
        for index, chunk in enumerate(chunks):
            DocumentChunk.objects.create(
                document=document,
                chunk_index=index,
                page_number=1,
                text=chunk.strip(),
            )

    @staticmethod
    def process_document(document) -> int:
        text = DocumentProcessingService.extract_text_from_uploaded_file(document.file)
        chunks = DocumentProcessingService.chunk_text(text)
        DocumentProcessingService.store_chunks(document, chunks)
        document.status = document.Status.READY
        document.save(update_fields=["status", "updated_at"])
        return len(chunks)
