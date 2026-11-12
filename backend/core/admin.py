from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import ClaimDraft, Company, Document, DocumentChunk, Message, ChatSession, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("email", "first_name", "last_name", "company", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active", "company")
    search_fields = ("email", "first_name", "last_name", "company__name")
    ordering = ("email",)
    list_select_related = ("company",)
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Company access", {"fields": ("company", "phone_number", "role")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "username", "password1", "password2")}),
    )


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("company", "name", "document_type", "status", "uploaded_at")
    list_filter = ("document_type", "status", "company")
    search_fields = ("name",)


@admin.register(DocumentChunk)
class DocumentChunkAdmin(admin.ModelAdmin):
    list_display = ("document", "chunk_index", "page_number")
    search_fields = ("text",)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("company", "channel", "status", "updated_at")
    list_filter = ("channel", "status")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("session", "sender", "created_at")
    list_filter = ("sender",)


@admin.register(ClaimDraft)
class ClaimDraftAdmin(admin.ModelAdmin):
    list_display = ("company", "shipment_id", "status", "created_at")
    list_filter = ("status", "company")
    search_fields = ("shipment_id", "subject")
