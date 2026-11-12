from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
import pymupdf
from rest_framework.test import APIClient

from .models import ClaimDraft, Company, Document, DocumentChunk
from .services.claim_service import ClaimDraftService
from .services.document_service import DocumentProcessingService
from .services.rag_service import RAGService

User = get_user_model()


class AuthFlowTests(TestCase):
    def test_register_creates_company_and_user(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "first_name": "Arvind",
                "last_name": "Kumar",
                "email": "arvind@example.com",
                "password": "StrongPass123!",
                "company_name": "ABC Logistics",
                "role": "accounts",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(email="arvind@example.com").exists())
        self.assertTrue(Company.objects.filter(name="ABC Logistics").exists())
        self.assertEqual(User.objects.get(email="arvind@example.com").role, "owner")
        self.assertIn("token", response.data)

    def test_company_names_can_share_unique_slugs(self):
        first = Company.objects.create(name="ABC Logistics")
        second = Company.objects.create(name="ABC Logistics")

        self.assertNotEqual(first.slug, second.slug)

    def test_inactive_user_cannot_log_in(self):
        company = Company.objects.create(name="Inactive Freight")
        User.objects.create_user(
            email="inactive@freight.com",
            password="StrongPass123!",
            company=company,
            username="inactiveuser",
            is_active=False,
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "inactive@freight.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_login_returns_token_for_company_user(self):
        company = Company.objects.create(name="XYZ Freight")
        user = User.objects.create_user(
            email="ops@xyz.com",
            password="StrongPass123!",
            company=company,
            username="opsxyz",
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "ops@xyz.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], user.email)
        self.assertIn("token", response.data)

    def test_login_works_with_existing_admin_session(self):
        company = Company.objects.create(name="Session Freight")
        user = User.objects.create_user(
            email="session@freight.com",
            password="StrongPass123!",
            company=company,
            username="sessionuser",
            is_staff=True,
        )
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(user)

        response = client.post(
            "/api/auth/login/",
            {"email": user.email, "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)

    def test_inactive_company_cannot_access_authenticated_api(self):
        company = Company.objects.create(name="Suspended Freight", is_active=False)
        user = User.objects.create_user(
            email="user@suspendedfreight.com",
            password="StrongPass123!",
            company=company,
            username="suspendeduser",
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 403)


class IngestionFlowTests(TestCase):
    def test_selectable_text_pdf_is_extracted(self):
        pdf = pymupdf.open()
        page = pdf.new_page()
        page.insert_text((72, 72), "Clause 1: Late delivery penalty applies.")
        uploaded_file = SimpleUploadedFile("contract.pdf", pdf.tobytes(), content_type="application/pdf")

        DocumentProcessingService.validate_uploaded_file(uploaded_file)
        text = DocumentProcessingService.extract_text_from_uploaded_file(uploaded_file)

        self.assertIn("Late delivery penalty", text)

    def test_upload_validation_rejects_non_pdf_and_invalid_pdf_signature(self):
        image = SimpleUploadedFile("scan.png", b"not-an-image", content_type="image/png")
        invalid_pdf = SimpleUploadedFile("contract.pdf", b"not-a-pdf", content_type="application/pdf")

        with self.assertRaisesMessage(ValueError, "Upload a PDF document"):
            DocumentProcessingService.validate_uploaded_file(image)
        with self.assertRaisesMessage(ValueError, "not a valid PDF"):
            DocumentProcessingService.validate_uploaded_file(invalid_pdf)

    def test_empty_extraction_does_not_create_searchable_placeholder_chunks(self):
        self.assertEqual(DocumentProcessingService.chunk_text(""), [])

    def test_chunking_creates_company_scoped_document_sections(self):
        company = Company.objects.create(name="Freight Co")
        user = User.objects.create_user(
            email="ingest@freightco.com",
            password="StrongPass123!",
            company=company,
            username="ingestfreight",
        )

        document = Document.objects.create(
            company=company,
            owner=user,
            name="sample-contract.pdf",
            file=SimpleUploadedFile("sample-contract.pdf", b"%PDF-1.4", content_type="application/pdf"),
            document_type=Document.DocumentType.CONTRACT,
            status=Document.Status.UPLOADED,
        )

        text = "Clause 1: Late delivery penalty.\nClause 2: Detention charges.\nClause 3: Claims process."
        chunks = DocumentProcessingService.chunk_text(text)
        DocumentProcessingService.store_chunks(document, chunks)

        self.assertGreater(len(chunks), 0)
        self.assertTrue(any("Clause 1" in chunk for chunk in chunks))
        self.assertEqual(document.chunks.count(), len(chunks))


class RAGFlowTests(TestCase):
    def test_search_returns_only_company_documents(self):
        company_a = Company.objects.create(name="Company A")
        company_b = Company.objects.create(name="Company B")
        user_a = User.objects.create_user(
            email="a@companya.com",
            password="StrongPass123!",
            company=company_a,
            username="usera",
        )
        user_b = User.objects.create_user(
            email="b@companyb.com",
            password="StrongPass123!",
            company=company_b,
            username="userb",
        )

        doc_a = Document.objects.create(
            company=company_a,
            owner=user_a,
            name="contract-a.pdf",
            file=SimpleUploadedFile("contract-a.pdf", b"%PDF-1.4", content_type="application/pdf"),
            document_type=Document.DocumentType.CONTRACT,
            status=Document.Status.READY,
        )
        doc_b = Document.objects.create(
            company=company_b,
            owner=user_b,
            name="contract-b.pdf",
            file=SimpleUploadedFile("contract-b.pdf", b"%PDF-1.4", content_type="application/pdf"),
            document_type=Document.DocumentType.CONTRACT,
            status=Document.Status.READY,
        )

        DocumentChunk.objects.create(document=doc_a, chunk_index=0, page_number=1, text="Late delivery penalty is 2 percent of freight value.")
        DocumentChunk.objects.create(document=doc_b, chunk_index=0, page_number=1, text="Late delivery penalty is 5 percent of freight value.")

        results = RAGService.search(company_id=company_a.id, query="late delivery penalty")

        self.assertEqual(len(results), 1)
        self.assertIn("2 percent", results[0].text)
        self.assertNotIn("5 percent", results[0].text)

    def test_answer_includes_source_citation(self):
        company = Company.objects.create(name="Claims Co")
        user = User.objects.create_user(
            email="claims@claimsco.com",
            password="StrongPass123!",
            company=company,
            username="claimsuser",
        )
        document = Document.objects.create(
            company=company,
            owner=user,
            name="rate-contract.pdf",
            file=SimpleUploadedFile("rate-contract.pdf", b"%PDF-1.4", content_type="application/pdf"),
            document_type=Document.DocumentType.CONTRACT,
            status=Document.Status.READY,
        )
        DocumentChunk.objects.create(
            document=document,
            chunk_index=0,
            page_number=4,
            text="Clause 7.2: Late delivery penalty is 2 percent of freight value.",
        )

        answer = RAGService.answer_question(company_id=company.id, question="What is the late delivery penalty?")

        self.assertIn("2 percent", answer["answer"])
        self.assertIn("rate-contract.pdf", answer["sources"][0]["document_name"])
        self.assertIn("Clause 7.2", answer["sources"][0]["text"]) or self.assertIn("Late delivery penalty", answer["sources"][0]["text"])


class ClaimWorkflowTests(TestCase):
    def test_claim_draft_can_be_approved(self):
        company = Company.objects.create(name="Freight Co")
        user = User.objects.create_user(
            email="claims@freightco.com",
            password="StrongPass123!",
            company=company,
            username="submitter",
        )

        draft = ClaimDraftService.create_claim_draft(
            company=company,
            owner=user,
            shipment_id="SHIP-1001",
            subject="Late delivery claim",
            issue="Delivery was delayed by 3 days beyond agreed SLA.",
        )

        updated = ClaimDraftService.approve_claim_draft(draft.id, company.id)

        self.assertEqual(updated.status, ClaimDraft.Status.APPROVED)
        self.assertEqual(updated.company, company)

        sent = ClaimDraftService.mark_claim_sent(draft.id, company.id)
        self.assertEqual(sent.status, ClaimDraft.Status.SENT)

    def test_claim_transitions_require_company_scope_and_valid_state(self):
        company = Company.objects.create(name="Freight Co")
        other_company = Company.objects.create(name="Other Freight Co")
        user = User.objects.create_user(
            email="claims@freightco.com",
            password="StrongPass123!",
            company=company,
            username="claimsuser",
        )
        draft = ClaimDraftService.create_claim_draft(
            company=company,
            owner=user,
            shipment_id="SHIP-1002",
            subject="Damage claim",
            issue="Cargo arrived damaged.",
        )

        with self.assertRaises(ClaimDraft.DoesNotExist):
            ClaimDraftService.approve_claim_draft(draft.id, other_company.id)
        ClaimDraftService.approve_claim_draft(draft.id, company.id)
        with self.assertRaisesMessage(ValueError, "Only draft claims can be approved"):
            ClaimDraftService.approve_claim_draft(draft.id, company.id)

    def test_claim_draft_requires_valid_fields(self):
        company = Company.objects.create(name="Test Company")
        user = User.objects.create_user(
            email="ops@testcompany.com",
            password="StrongPass123!",
            company=company,
            username="opsuser",
        )

        with self.assertRaises(ValueError):
            ClaimDraftService.create_claim_draft(
                company=company,
                owner=user,
                shipment_id="",
                subject="Missing shipment",
                issue="Issue detail",
            )

    def test_claim_owner_must_belong_to_company(self):
        company = Company.objects.create(name="Claim Company")
        other_company = Company.objects.create(name="Other Company")
        user = User.objects.create_user(
            email="user@othercompany.com",
            password="StrongPass123!",
            company=other_company,
            username="othercompanyuser",
        )

        with self.assertRaisesMessage(ValueError, "owner must belong to the claim company"):
            ClaimDraftService.create_claim_draft(
                company=company,
                owner=user,
                shipment_id="SHIP-1003",
                subject="Cross-company claim",
                issue="This should not be stored.",
            )
