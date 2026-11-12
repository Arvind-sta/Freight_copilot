"""Backend package for the Freight Contract & Claims Copilot."""

from .celery import app as celery_app

__all__ = ("celery_app",)
