from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClaimDraft, Company, Document
from .permissions import IsAuthenticatedCompanyUser
from .serializers import ClaimDraftSerializer, DocumentSerializer, LoginSerializer, RegisterSerializer, UserSerializer
from .services.claim_service import ClaimDraftService
from .services.document_service import DocumentProcessingService
from .services.rag_service import RAGService
from .tasks import process_document_upload

User = get_user_model()


class HealthCheckView(APIView):
    permission_classes = []

    def get(self, request):
        return Response({"status": "ok", "service": "freight-contract-claims-copilot"})


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [TokenAuthentication]
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "token": token.key,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [TokenAuthentication]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"user": UserSerializer(user).data, "token": token.key})


class MeView(APIView):
    permission_classes = [IsAuthenticatedCompanyUser]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class DocumentListCreateView(APIView):
    permission_classes = [IsAuthenticatedCompanyUser]
    throttle_scope = "document_upload"

    def get(self, request):
        company_id = request.user.company_id
        documents = Document.objects.filter(company_id=company_id) if company_id else Document.objects.none()
        serializer = DocumentSerializer(documents, many=True)
        return Response(serializer.data)

    def post(self, request):
        company_id = request.user.company_id
        if not company_id:
            return Response({"detail": "User is not linked to a company."}, status=400)

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "A file is required."}, status=400)

        try:
            DocumentProcessingService.validate_uploaded_file(uploaded_file)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        company = Company.objects.get(id=company_id)
        document = Document.objects.create(
            company=company,
            owner=request.user,
            name=uploaded_file.name,
            file=uploaded_file,
            document_type=DocumentProcessingService.detect_document_type(uploaded_file.name),
            status=Document.Status.PROCESSING,
        )

        process_document_upload.delay(document.id)

        serializer = DocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ClaimDraftCreateView(APIView):
    permission_classes = [IsAuthenticatedCompanyUser]
    throttle_scope = "claims"

    def post(self, request):
        company_id = request.user.company_id
        if not company_id:
            return Response({"detail": "User is not linked to a company."}, status=400)

        subject = request.data.get("subject")
        shipment_id = request.data.get("shipment_id")
        issue = request.data.get("issue")

        if not subject or not shipment_id or not issue:
            return Response({"detail": "subject, shipment_id, and issue are required."}, status=400)

        company = Company.objects.get(id=company_id)
        draft = ClaimDraftService.create_claim_draft(
            company=company,
            owner=request.user,
            shipment_id=shipment_id,
            subject=subject,
            issue=issue,
        )

        serializer = ClaimDraftSerializer(draft)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RAGSearchView(APIView):
    permission_classes = [IsAuthenticatedCompanyUser]
    throttle_scope = "rag"

    def post(self, request):
        question = (request.data.get("question") or "").strip()
        if not question:
            return Response({"detail": "A question is required."}, status=400)

        chunks = RAGService.search(company_id=request.user.company_id, query=question, limit=5)
        return Response(
            {
                "question": question,
                "results": [
                    {
                        "document_name": chunk.document.name,
                        "page_number": chunk.page_number,
                        "chunk_index": chunk.chunk_index,
                        "text": chunk.text,
                    }
                    for chunk in chunks
                ],
            }
        )


class RAGAnswerView(APIView):
    permission_classes = [IsAuthenticatedCompanyUser]
    throttle_scope = "rag"

    def post(self, request):
        question = (request.data.get("question") or "").strip()
        if not question:
            return Response({"detail": "A question is required."}, status=400)

        result = RAGService.answer_question(company_id=request.user.company_id, question=question)
        return Response(result)
