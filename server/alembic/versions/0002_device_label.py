"""add devices.label

Revision ID: 0002_device_label
Revises: 0001_initial
Create Date: 2026-08-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_device_label"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("devices") as batch:
        batch.add_column(sa.Column("label", sa.String(length=120), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("devices") as batch:
        batch.drop_column("label")
