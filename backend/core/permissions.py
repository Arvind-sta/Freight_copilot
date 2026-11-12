from rest_framework.permissions import IsAuthenticated


class IsAuthenticatedCompanyUser(IsAuthenticated):
    """Secure default for company-scoped data access."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        company = getattr(request.user, "company", None)
        return bool(getattr(request.user, "is_active", False) and company and company.is_active)
