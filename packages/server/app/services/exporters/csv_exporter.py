"""CSV annotation exporter."""

from __future__ import annotations

import csv
import io

from app.models.annotation import Annotation
from app.utils.annotations import annotation_type_value


def export_csv(annotations: list[Annotation]) -> str:
    """Convert annotations to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'type',
        'content',
        'note',
        'color',
        'tags',
        'location',
        'created_at',
    ])

    for ann in annotations:
        ann_type = annotation_type_value(ann.type)
        writer.writerow([
            ann_type,
            ann.content,
            ann.note or '',
            ann.color or '',
            ','.join(ann.tags or []),
            str(ann.location),
            ann.created_at.isoformat() if ann.created_at else '',
        ])

    return output.getvalue()
