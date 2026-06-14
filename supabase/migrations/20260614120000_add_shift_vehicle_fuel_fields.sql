alter table public.vehicle_checks
  add column if not exists closing_odometer integer,
  add column if not exists inspection_duration_seconds integer,
  add column if not exists signature_url text;

alter table public.expenses
  add column if not exists fuel_litres numeric,
  add column if not exists session_id uuid references public.work_sessions(id) on delete set null,
  add column if not exists vehicle_check_id uuid references public.vehicle_checks(id) on delete set null,
  add column if not exists vehicle_reg text;

create index if not exists vehicle_checks_driver_reg_created_idx
  on public.vehicle_checks (driver_id, reg_number, created_at desc);

create index if not exists expenses_user_category_date_idx
  on public.expenses (user_id, category, date desc);

create index if not exists expenses_session_id_idx
  on public.expenses (session_id);
