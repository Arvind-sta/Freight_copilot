from django.urls import path

from .views import (
    ClaimDraftCreateView,
    DocumentListCreateView,
    HealthCheckView,
    LoginView,
    MeView,
    RAGAnswerView,
    RAGSearchView,
    RegisterView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("documents/", DocumentListCreateView.as_view(), name="documents"),
    path("claims/", ClaimDraftCreateView.as_view(), name="claims"),
    path("rag/search/", RAGSearchView.as_view(), name="rag-search"),
    path("rag/answer/", RAGAnswerView.as_view(), name="rag-answer"),
]
