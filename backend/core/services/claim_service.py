from __future__ import annotations

from django.db import transaction

from ..models import ClaimDraft


class ClaimDraftService:
    """Creates and manages claim drafts for company-scoped workflows."""

    @staticmethod
    def build_claim(subject: str, shipment_id: str, issue: str) -> str:
        if not subject or not shipment_id or not issue:
            raise ValueError("subject, shipment_id, and issue are required.")

        return (
            f"Subject: {subject}\n\n"
            f"Shipment ID: {shipment_id}\n\n"
            "Dear Team,\n\n"
            "This is to formally raise a claim in relation to the above shipment. "
            "The issue identified is as follows:\n\n"
            f"{issue}\n\n"
            "Please review the matter and share the supporting documents and next steps required.\n\n"
            "Regards,\n"
            "Operations Team"
        )

    @staticmethod
    def create_claim_draft(company, owner, shipment_id: str, subject: str, issue: str) -> ClaimDraft:
        if not company:
            raise ValueError("company is required.")
        if not owner:
            raise ValueError("owner is required.")
        if not company.is_active:
            raise ValueError("company must be active.")
        if owner.company_id != company.id:
            raise ValueError("owner must belong to the claim company.")
        if not owner.is_active:
            raise ValueError("owner must be active.")
        if not shipment_id or not shipment_id.strip():
            raise ValueError("shipment_id is required.")
        if not subject or not subject.strip():
            raise ValueError("subject is required.")
        if not issue or not issue.strip():
            raise ValueError("issue is required.")

        return ClaimDraft.objects.create(
            company=company,
            owner=owner,
            shipment_id=shipment_id.strip(),
            subject=subject.strip(),
            body=ClaimDraftService.build_claim(subject.strip(), shipment_id.strip(), issue.strip()),
            status=ClaimDraft.Status.DRAFT,
        )

    @staticmethod
    def approve_claim_draft(claim_id: int, company_id: int) -> ClaimDraft:
        with transaction.atomic():
            claim = ClaimDraft.objects.select_for_update().get(id=claim_id, company_id=company_id)
            if claim.status != ClaimDraft.Status.DRAFT:
                raise ValueError("Only draft claims can be approved.")
            claim.status = ClaimDraft.Status.APPROVED
            claim.save(update_fields=["status", "updated_at"])
        return claim

    @staticmethod
    def mark_claim_sent(claim_id: int, company_id: int) -> ClaimDraft:
        with transaction.atomic():
            claim = ClaimDraft.objects.select_for_update().get(id=claim_id, company_id=company_id)
            if claim.status != ClaimDraft.Status.APPROVED:
                raise ValueError("Only approved claims can be marked as sent.")
            claim.status = ClaimDraft.Status.SENT
            claim.save(update_fields=["status", "updated_at"])
        return claim
