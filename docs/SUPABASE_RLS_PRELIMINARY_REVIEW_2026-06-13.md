# Supabase RLS Predicate Review

Date: 2026-06-13

Tracker item: LR-15

## Scope

This review uses the policy predicate, storage bucket, routine, and trigger exports supplied on 2026-06-13.

It includes:

- Table names.
- Policy names.
- Policy command type.
- Applied role class, such as `authenticated` or `public`.
- `USING` expressions.
- `WITH CHECK` expressions.
- Storage bucket rows.
- Storage object policies.
- Routine names and security mode.
- Trigger names and action statements.

It does not include full function bodies or edge-function source from the portal project.

## Critical Findings

| Severity | Asset | Finding | Why it matters | Required action |
| --- | --- | --- | --- | --- |
| Critical | `public.broadcasts` trigger `on_new_broadcast` | Trigger action embeds a service-role bearer token in the database definition | Anyone with metadata/export access can recover a privileged token; the token was also pasted into this chat | Rotate Supabase service-role JWT/secret immediately, remove bearer tokens from trigger definitions, and use Supabase Vault or an edge-function secret pattern |
| Critical | `public.tachograph_files` trigger `process_tacho_files` | Trigger action embeds a service-role bearer token in the database definition | Same service-role exposure risk | Rotate token and replace trigger auth mechanism |
| High | `driver_invites` | `Allow unauthenticated access by invite code` has `roles = public`, `cmd = SELECT`, `qual = true` | Allows anonymous reads of all invite rows through the Data API unless other grants block it | Remove broad SELECT; use a narrow SECURITY DEFINER RPC or edge function that validates one invite code and returns only safe fields |
| High | `shift_jobs` | Mobile app reads this table, but no policy was listed | Report data may silently disappear for mobile users | Add owner/company-scoped SELECT policy or remove mobile dependency |
| High | `defect-photos` storage | App uploads to `defect-photos`, but exported storage policies include SELECT/DELETE only, no INSERT | Vehicle checklist signatures/photos may fail to upload | Add INSERT policy matching actual app paths or adjust app paths to existing policies |
| High | `driver-documents` storage | Solo mobile app uploads to `driver-documents` paths like `<userId>/quals/...`, but policies only allow manager company-folder uploads | Solo qualification upload likely fails | Add solo-driver upload/read policies or route uploads through manager/company flow only |
| High | `vehicle-documents` storage | Solo mobile app creates signed URLs and service helper uploads, but storage policies only allow manager company-folder access | Solo vehicle document upload/view likely fails | Add solo vehicle owner policies or remove solo vehicle-document upload path |

## Overall Assessment

The core owner-scoped policies for `work_sessions`, `work_session_segments`, `profiles`, `pay_configurations`, `expenses`, `messages`, and `business_profiles` are directionally correct because they constrain access using `auth.uid()`, company helper functions, or manager role checks.

However, this is not launch-ready because the invite table has anonymous broad read access, storage policies do not match mobile upload paths, and service-role secrets are embedded in trigger definitions.

## Mobile-Used Tables: Predicate Review

| Table | Mobile-used | Predicate review | Status |
| --- | --- | --- | --- |
| `broadcasts` | Yes | Company member SELECT, driver SELECT, manager ALL scoped by helper functions | Mostly acceptable after helper-function audit; duplicate policies could be simplified |
| `business_profiles` | Yes | ALL where `user_id = auth.uid()` | Acceptable owner scope |
| `clients` | Yes | Public-role ALL where `auth.uid() = user_id` | Acceptable owner scope, but add explicit `WITH CHECK` for clarity |
| `companies` | Yes | Create where `auth.uid() = created_by`; manager update/select via helper functions | Needs helper-function audit; update policy should include `WITH CHECK` |
| `defect_photos` | Yes | Driver ALL by linked check owner; manager SELECT by company | Acceptable metadata scope |
| `driver_documents` | Yes | Driver own SELECT, manager company policies | Metadata mostly acceptable, but broad public manager ALL should be replaced with authenticated role and explicit `WITH CHECK` |
| `driver_invites` | Yes | Includes anonymous `SELECT true` policy | Launch blocker |
| `expenses` | Yes | Owner CRUD using `auth.uid() = user_id`; manager company SELECT | Directionally acceptable, but public-role policies should be moved to authenticated where possible |
| `message_reads` | Yes | ALL where `auth.uid() = user_id` | Acceptable owner scope; add `WITH CHECK` for clarity |
| `messages` | Yes | Sender insert, recipient update/read, manager company access | Directionally acceptable; manager ALL needs helper-function audit |
| `pay_configurations` | Yes | Owner ALL; manager company SELECT | Directionally acceptable; sensitive data means helper function must be audited |
| `profiles` | Yes | Self INSERT/UPDATE/SELECT plus manager same-company SELECT | Directionally acceptable; verify `prevent_role_escalation` covers role/company/payroll-sensitive updates |
| `shift_jobs` | Yes | No policies listed | Launch blocker for mobile reports |
| `shifts` | Yes | Driver own SELECT, manager company ALL | Directionally acceptable |
| `system_messages` | Yes | Authenticated read policies | Acceptable if system messages are non-sensitive |
| `vehicle_checks` | Yes | Driver insert/select, manager company select/update | Directionally acceptable; public-role duplicates should be simplified |
| `vehicle_documents` | Yes | Manager company policies and public company ALL | Metadata policy may expose too much to non-manager company members; storage also mismatched |
| `vehicles` | Yes | Driver company SELECT, manager company ALL, solo owner ALL | Directionally acceptable |
| `work_session_segments` | Yes | User INSERT/SELECT/UPDATE where `auth.uid() = user_id` | Acceptable owner scope, but use authenticated role instead of public for clarity |
| `work_sessions` | Yes | User ALL where `auth.uid() = user_id`; manager same-company SELECT | Directionally acceptable owner/company scope |

## Non-Mobile Tables With No Policies

The dashboard listing says these tables have no policies and would return no Data API rows:

- `billing_rates`
- `driver_card_downloads`
- `driver_tacho_compliance_signals`
- `driver_tacho_risk_signals`
- `shift_jobs`
- `tacho_infringements`
- `tachograph_activities`
- `tachograph_activity_segments`
- `tachograph_day_summaries`
- `tachograph_findings`
- `tachograph_processing_runs`
- `tachograph_reconciliation_items`
- `tachograph_speed_logs`
- `tachograph_technical_events`
- `tachograph_vehicle_motion_discrepancies`
- `training_records`
- `vehicle_unit_downloads`

Most are portal/tachograph-import tables, but `shift_jobs` is mobile-used by `reportService`, so it needs a policy or the mobile reporting path will not receive those rows.

## Storage Review

| Bucket | Public | Size limit | MIME limit | Mobile usage | Finding |
| --- | --- | --- | --- | --- | --- |
| `defect-photos` | false | none | none | Upload checklist signatures/photos, read URLs | Missing INSERT policy; MIME/size unrestricted |
| `driver-documents` | false | 5 MB | JPEG/PNG/PDF | Upload/view driver docs | Manager policies exist, but solo mobile upload path is not covered |
| `logos` | true | none | none | Upload/read business logo public URL | Public is acceptable for logos, but add image MIME and size limits |
| `vehicle-documents` | false | none | none | Upload/view vehicle docs | Manager policies exist, but solo mobile upload/view path is not covered |
| `receipts` | false | none | none | Not currently in mobile client inventory | Owner-folder policies exist; review if expense receipt upload is re-enabled |
| `maintenance-docs` | true | none | none | Not currently in mobile client inventory | Public maintenance documents look risky unless intentionally public |

Storage path mismatches:

- `VehicleChecklistModal` uploads signatures to `signatures/<userId>/<checkId>.png`, but `defect-photos` policies scope by first folder as company/solo.
- `VehicleChecklistModal` uploads defect photos to `<companyPrefix>/<checkId>/...`, but no INSERT policy exists for `defect-photos`.
- `SoloQualificationsModal` uploads driver documents to `<userId>/quals/...`, but `driver-documents` policies expect manager company-folder paths.
- `vehicleDocumentService` uploads vehicle documents to `<companyId or solo>/<vehicleId>/...`, but `vehicle-documents` policies are manager-company scoped only.

## Auth And Supabase Internal Schemas

The supplied `auth.*`, `storage.*`, and `supabase_functions.*` table definitions are useful context but are not app-owned launch assets. The audit should focus on:

- Public tables exposed through the Data API.
- Storage buckets and storage object policies.
- RPCs callable by client code.
- Edge functions callable by the mobile app or portal.

Do not audit Supabase-managed internals as if they were product tables.

## Required Remaining Evidence

Function bodies are still needed for helper and SECURITY DEFINER audit:

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'accept_driver_invite',
    'get_auth_user_company',
    'get_auth_user_role',
    'get_my_company_id',
    'get_my_role',
    'prevent_role_escalation',
    'update_user_claims',
    'validate_auth_code'
  )
order by p.proname;
```

Edge-function source/config is still needed for:

- `delete-user-data`
- `send-broadcast`
- `process-tacho`
- deployed `calculate-compliance`, if different from local repo source

## Launch Blockers

Confirmed blockers before public release:

- Rotate the exposed service-role token/secret and remove embedded bearer tokens from trigger definitions.
- Replace `driver_invites` anonymous `SELECT true` policy.
- Add/fix `shift_jobs` RLS policy for mobile report reads.
- Add/fix storage policies for mobile upload/read paths on `defect-photos`, `driver-documents`, and `vehicle-documents`.
- Add size/MIME constraints for `defect-photos`, `vehicle-documents`, and `logos`.
- Audit SECURITY DEFINER helper functions used by RLS before trusting manager/company scoping.

## LR-15 Status

LR-15 is ready for remediation planning from the mobile app perspective. Final closure requires applying fixes and re-exporting policies/bucket config.
