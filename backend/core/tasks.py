from celery import shared_task

from .models import Document
from .services.document_service import DocumentProcessingService


@shared_task
def process_document_upload(document_id: int) -> int:
    document = Document.objects.get(id=document_id)

    try:
        chunk_count = DocumentProcessingService.process_document(document)
        return chunk_count
    except Exception:
        document.status = Document.Status.FAILED
        document.save(update_fields=["status", "updated_at"])
        raise
