from __future__ import annotations

import re
from typing import Any

from ..models import Document, DocumentChunk


class RAGService:
    """Minimal retrieval layer for company-scoped contract answers."""

    @staticmethod
    def _tokenize(value: str) -> list[str]:
        return [token for token in re.findall(r"[a-zA-Z0-9%]+", (value or "").lower()) if len(token) > 2]

    @staticmethod
    def search(company_id: int, query: str, limit: int = 5) -> list[DocumentChunk]:
        if not company_id or not query or not query.strip():
            return []

        tokens = RAGService._tokenize(query)
        if not tokens:
            return []

        queryset = (
            DocumentChunk.objects.filter(document__company_id=company_id, document__status=Document.Status.READY)
            .select_related("document")
            .order_by("-chunk_index")
        )

        scored: list[tuple[int, DocumentChunk]] = []
        for chunk in queryset:
            text = (chunk.text or "").lower()
            score = 0
            for token in tokens:
                if token in text:
                    score += text.count(token)
            if score:
                scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored[:limit]]

    @staticmethod
    def answer_question(company_id: int, question: str) -> dict[str, Any]:
        hits = RAGService.search(company_id=company_id, query=question, limit=5)
        if not hits:
            return {
                "answer": "I could not find this information in the uploaded documents for this company.",
                "sources": [],
            }

        best_hit = hits[0]
        answer = best_hit.text.strip()
        if len(answer) > 400:
            answer = answer[:400].rstrip() + "..."

        sources = [
            {
                "document_name": hit.document.name,
                "page_number": hit.page_number,
                "chunk_index": hit.chunk_index,
                "text": hit.text,
            }
            for hit in hits
        ]

        return {
            "answer": answer,
            "sources": sources,
        }
