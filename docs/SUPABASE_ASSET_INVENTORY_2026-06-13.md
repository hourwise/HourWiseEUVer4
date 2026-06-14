# Supabase Asset Inventory

Date: 2026-06-13

Tracker item: LR-14

## Scope

This inventory combines:

- Mobile app Supabase usage found in `src/`.
- Local Supabase assets found in `supabase/`.
- Schema-only table DDL supplied by the user on 2026-06-13.
- Generated local database types in `src/lib/database.types.ts`.

This is an inventory only. It does not prove that RLS policies are correct.

## Source Completeness

Provided:

- Public table DDL and foreign keys.
- Local migrations in this repo.
- Local edge-function source in this repo.
- Local generated DB types.
- Dashboard-style RLS policy names, commands, and applied roles supplied after the first inventory pass.
- Full `pg_policies` predicates, storage bucket rows, routine metadata, and trigger metadata supplied after the preliminary LR-15 pass.

Not provided:

- Full function bodies for SECURITY DEFINER helper functions and RPCs.
- Source/config for portal-only edge functions.
- Edge functions from the portal repo.
- Full RPC/function DDL.
- Triggers, indexes, grants, publication/realtime settings, and auth settings.

## Mobile Client Tables

These tables are directly used by the mobile app:

| Table | Mobile usage | Launch audit focus |
| --- | --- | --- |
| `broadcasts` | Read latest company broadcasts | Company-scoped reads |
| `business_profiles` | Read/upsert business profile, invoice counter update | Owner-only access |
| `clients` | Read/upsert/delete client billing records | Owner-only access |
| `companies` | Read company name for fleet account | Fleet membership scoping |
| `defect_photos` | Read/insert/delete defect photo metadata | Linked vehicle-check ownership |
| `driver_documents` | Insert/read driver document metadata | Driver/fleet access boundaries |
| `driver_invites` | Read/update invite records during signup | Invite-code leakage and accept flow |
| `expenses` | Insert/read report expenses | Owner-only access |
| `message_reads` | Read/insert message read receipts | User-owned receipt writes |
| `messages` | Read/update/insert direct messages | Sender/recipient/company scoping |
| `pay_configurations` | Read/upsert pay settings | Owner-only and fleet snapshot rules |
| `profiles` | Read/insert/update profile, setup flags, qualifications | Sensitive PII and self/company access |
| `shift_jobs` | Read shift job report data | Owner-only access |
| `shifts` | Read schedule entries | Driver/company schedule scoping |
| `system_messages` | Read global system messages | Intended public authenticated visibility |
| `vehicle_checks` | Read/insert/update vehicle checklist records | Driver/company/session ownership |
| `vehicle_documents` | Insert/read vehicle document metadata | Vehicle/company ownership |
| `vehicles` | Read/upsert solo vehicle profile | User/company vehicle scoping |
| `work_session_segments` | Upsert/update timer segment ledger | User-owned append/update constraints |
| `work_sessions` | Read/insert/update/delete work sessions | Core timer ownership and history access |

## Mobile Client Storage Buckets

These buckets are directly used by the mobile app:

| Bucket | Mobile usage | Access pattern |
| --- | --- | --- |
| `defect-photos` | Upload/remove defect photos, read public URLs | Currently uses public URLs for display |
| `driver-documents` | Upload driver qualification documents, create signed URLs | Sensitive document storage |
| `logos` | Upload business logos, read public URLs | Public logo asset |
| `vehicle-documents` | Upload vehicle documents, create signed URLs | Sensitive document storage |

Storage bucket definitions and policies were not included in the supplied schema. LR-15/LR-18 should verify bucket privacy, signed URL policies, upload path ownership, file-size limits, and MIME-type validation.

## Mobile Client RPCs And Edge Functions

| Asset | Type | Mobile usage | Inventory status |
| --- | --- | --- | --- |
| `accept_driver_invite` | RPC | Called after fleet user signup | Used by app but not present in local generated DB types or supplied DDL |
| `delete-user-data` | Edge function | Invoked from account management delete flow | Used by app but no local source found in this repo |

## Local Supabase Edge Functions

| Function | Local source | Uses | Notes |
| --- | --- | --- | --- |
| `calculate-compliance` | `supabase/functions/calculate-compliance/index.ts` | Reads/updates `work_sessions` with service-role authorization header | Not found as mobile-invoked in current code search |
| `ocr-receipt` | `supabase/functions/ocr-receipt/index.ts` | Calls OCR.space using `OCR_API_KEY` | Not found as mobile-invoked in current code search |

## Generated Types Functions

`src/lib/database.types.ts` lists these public functions:

- `generate_auth_code`
- `generate_invoice_number`
- `validate_auth_code`

The mobile app does not currently call these functions directly. The app does call `accept_driver_invite`, which is missing from the generated types.

## Supplied Public Tables

The supplied schema includes these public tables:

| Table | Category |
| --- | --- |
| `alerts` | Portal/fleet alerts |
| `billing_rates` | Billing |
| `broadcasts` | Messaging |
| `business_profiles` | Billing/invoicing |
| `clients` | Billing/invoicing |
| `companies` | Fleet/company |
| `defect_photos` | Vehicle checks/storage metadata |
| `driver_card_downloads` | Tachograph import |
| `driver_documents` | Driver compliance documents |
| `driver_invites` | Fleet onboarding |
| `driver_tacho_compliance_signals` | Tachograph compliance |
| `driver_tacho_risk_signals` | Tachograph compliance |
| `expenses` | Expenses |
| `fuel_logs` | Fleet/vehicle operations |
| `incidents` | Fleet safety |
| `infringements` | Fleet compliance |
| `invoices` | Billing/invoicing |
| `maintenance_logs` | Fleet maintenance |
| `message_reads` | Messaging |
| `messages` | Messaging |
| `pay_configurations` | Pay setup |
| `profiles` | User profile and PII |
| `shift_jobs` | Shift billing detail |
| `shifts` | Scheduling |
| `system_messages` | Messaging |
| `tacho_activities` | Legacy/portal tachograph |
| `tacho_infringements` | Legacy/portal tachograph |
| `tachograph_activities` | Tachograph import |
| `tachograph_activity_segments` | Tachograph import |
| `tachograph_day_summaries` | Tachograph import |
| `tachograph_files` | Tachograph import files |
| `tachograph_findings` | Tachograph findings |
| `tachograph_processing_runs` | Tachograph processing |
| `tachograph_reconciliation_items` | Tachograph reconciliation |
| `tachograph_speed_logs` | Tachograph speed logs |
| `tachograph_technical_events` | Tachograph technical events |
| `tachograph_vehicle_motion_discrepancies` | Tachograph reconciliation |
| `training_records` | Fleet training |
| `vehicle_checks` | Vehicle checks |
| `vehicle_documents` | Vehicle document metadata |
| `vehicle_unit_downloads` | Tachograph import |
| `vehicles` | Fleet/solo vehicle records |
| `work_session_segments` | Mobile timer segment ledger |
| `work_sessions` | Mobile timer summary/history |

## Schema Mismatches And Follow-Ups

| Finding | Evidence | Risk | Next action |
| --- | --- | --- | --- |
| `profiles.first_time_setup_completed_at` is used by local code/types but absent from supplied schema | Local migration and generated types include it; pasted DDL does not | Portal schema export may be stale or migration not applied in target DB | Confirm live DB has the column before relying on setup routing |
| `profiles.expo_push_token` is updated by mobile code but absent from supplied schema and generated types | `MessagesScreen` updates `expo_push_token` | Push-token registration may fail at runtime | Confirm whether the column exists; add migration/types or remove update |
| `accept_driver_invite` RPC is called by mobile but absent from generated function types and supplied DDL | `AuthProvider` calls `supabase.rpc('accept_driver_invite', ...)` | Signup invite flow may be untyped or missing in this project snapshot | Export RPC DDL from portal repo and regenerate DB types |
| `delete-user-data` edge function is invoked by mobile but no local source exists | `AccountManagementScreen` invokes it | Delete-account flow may depend on portal-only function source | Pull/export function source and audit auth checks before launch |
| Storage bucket config was missing from the initial schema artifact | Later export supplied bucket rows and storage policies | Storage review moved into LR-15 predicate review | Remediate storage policy/path mismatches and re-export bucket config |
| Initial supplied DDL lacked RLS policy definitions | Later exports supplied policy names/actions/roles, predicates, storage buckets, routines, and triggers | LR-15 can proceed to remediation planning | Apply fixes, then re-export policies and storage config |

## LR-15 Inputs Needed

The final RLS predicate review is recorded in `docs/SUPABASE_RLS_PRELIMINARY_REVIEW_2026-06-13.md`.

Remaining LR-16 inputs needed:

- Function bodies for SECURITY DEFINER helper functions and RPCs.
- Portal-only edge function source/config for `delete-user-data`, `send-broadcast`, and `process-tacho`.
- Confirmation that the exposed service-role token/secret has been rotated.

Minimum SQL queries to export from the portal repo:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select routine_schema, routine_name, routine_type, security_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

select trigger_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;
```

## LR-14 Result

LR-14 is ready for review from the mobile repo perspective. Remaining gaps belong to LR-15/LR-16/LR-18 because they require policy, RPC, edge-function, and storage-bucket metadata not present in the supplied table-only schema.
