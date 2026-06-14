CREATE TABLE IF NOT EXISTS public.work_session_segments (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('work', 'break', 'poa', 'driving_reference')),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  client_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  client_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS idx_work_session_segments_session
ON public.work_session_segments(session_id, start_time);

CREATE INDEX IF NOT EXISTS idx_work_session_segments_user
ON public.work_session_segments(user_id, start_time);

CREATE INDEX IF NOT EXISTS idx_work_session_segments_open
ON public.work_session_segments(session_id)
WHERE end_time IS NULL;

ALTER TABLE public.work_session_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own work session segments"
ON public.work_session_segments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work session segments"
ON public.work_session_segments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work session segments"
ON public.work_session_segments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.work_session_segments IS
'Append-only/local-first activity ledger for reconstructing shift work, break, POA, and driving-reference periods.';
