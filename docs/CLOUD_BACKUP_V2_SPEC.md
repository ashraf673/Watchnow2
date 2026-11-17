# Watchnow2 Cloud Backup v2 — Implementation Specification

## Gallery model
- Preserve the existing Firebase media gallery unchanged.
- Cloud Backups remains a separate gallery.
- Each cloud photo is one gallery item with a permanent thumbnail and an optional full-resolution original.
- When the original is committed, the same gallery item switches to the original; do not create a duplicate card.
- The thumbnail remains available as a fallback until the original is ready.

## Pending-original decision panel
- When the selected device reports at least 100 MB of pending originals, show a prominent red warning with pending bytes and a clear upload decision.
- Offer three actions:
  1. Upload Everything — authorize every pending original.
  2. Cancel — tell Partypark to discard all pending private originals; cloud thumbnails remain.
  3. Custom Upload — show pending thumbnails, allow multi-select, display the total original size selected, and commit the selected photo IDs.

## Custom Upload semantics
- Example: 50 pending originals, owner selects 20 and presses Upload.
- Server stores the durable selection command for the device.
- Partypark keeps the 20 selected private originals and immediately deletes the 30 unselected private originals.
- Partypark uploads the selected 20 when it can reach the backend, even if it was offline when the command was created.
- Each selected private original is deleted immediately after its successful server commit.
- Each unselected cloud item remains as a thumbnail-only gallery item.
- The seven-day limit applies to selected originals awaiting upload, measured from capture time.

## Cloud retention and deletion
- Cloud photos do not expire automatically.
- Remove the scheduled 15-day photo deletion behavior, while retaining cleanup of expired activation codes and upload sessions.
- Provide authenticated manual per-photo and bulk deletion. Verify owner ownership and delete the actual Drive object before removing the D1 photo row; treat Drive 404 as already deleted.
- Clear All must remove all cloud photo variants for the selected device.

## Connectivity
- Partypark must verify successful reachability of its actual backend before polling commands or uploading; merely having Wi-Fi/mobile data enabled is insufficient.
- Offline commands remain durable until retrieved and acknowledged/applied by the device.

## Validation
- Test thumbnail fallback, same-card original replacement, pending queue threshold, selected-byte total, command persistence, offline reconnect, idempotent selection application, manual deletion, and retention cron behavior.
