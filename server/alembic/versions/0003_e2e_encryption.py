"""end-to-end encryption: user crypto params + encrypted_usage

Revision ID: 0003_e2e_encryption
Revises: 0002_device_label
Create Date: 2026-08-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_e2e_encryption"
down_revision: Union[str, None] = "0002_device_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("crypto_salt", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("crypto_iterations", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("crypto_verifier_nonce", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("crypto_verifier_ct", sa.String(length=255), nullable=True))

    op.create_table(
        "encrypted_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_encrypted_usage_device_id", "encrypted_usage", ["device_id"], unique=True
    )


def downgrade() -> None:
    op.drop_table("encrypted_usage")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("crypto_verifier_ct")
        batch.drop_column("crypto_verifier_nonce")
        batch.drop_column("crypto_iterations")
        batch.drop_column("crypto_salt")
