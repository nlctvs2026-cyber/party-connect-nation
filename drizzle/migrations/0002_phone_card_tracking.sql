-- 0002 — Card tracking by phone number.
--
-- A member tracks their application (and, once approved, opens their card)
-- with nothing but the mobile number they enrolled with:
--
--   - One ACTIVE application per phone number at a time. "Active" means the
--     application is pending or approved. A rejected application releases the
--     number, so the same person can simply enroll again with the same phone.
--   - Tracking is a single RPC: it returns pending / rejected / approved for
--     the most recent active application on that phone, plus a minimal,
--     deliberately non-sensitive payload (no address, no review notes). For
--     approved applications it includes the card's public token, so the
--     existing /verify/<token> links and printed QR codes stay undisturbed.
--   - A helper RPC lets the enrollment form check availability before upload.

-- ============ INDEXES ============
-- Fast phone lookups for tracking and duplicate checks (Postgres reads this
-- as "ORDER BY created_at DESC LIMIT 1" under the phone predicate).
CREATE INDEX IF NOT EXISTS idx_apps_phone_active
  ON public.membership_applications(phone)
  WHERE status IN ('pending', 'approved');

-- Members lookup by phone (secondary path for approved applications).
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);

-- ============ TRACKING (public, by phone) ============
CREATE OR REPLACE FUNCTION public.track_application(_phone TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
  card public.member_cards%ROWTYPE;
BEGIN
  -- Normalize: keep digits only, expect exactly 10.
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[0-9]{10}$' THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  SELECT * INTO app
  FROM public.membership_applications
  WHERE phone = _phone AND status IN ('pending', 'approved')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF app.status = 'approved' THEN
    SELECT * INTO card
    FROM public.member_cards
    WHERE member_id = (SELECT id FROM public.members WHERE application_id = app.id)
      AND revoked_at IS NULL;

    RETURN json_build_object(
      'status', 'approved',
      'full_name', app.full_name,
      'crf_no', (SELECT crf_no FROM public.members WHERE application_id = app.id),
      'district', app.district,
      'constituency', app.constituency,
      'submitted_at', app.created_at,
      'public_token', card.public_token
    );
  END IF;

  RETURN json_build_object(
    'status', app.status,
    'full_name', app.full_name,
    'district', app.district,
    'constituency', app.constituency,
    'submitted_at', app.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.track_application(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_application(TEXT) TO anon, authenticated;

-- ============ PHONE AVAILABILITY (public) ============
-- Rejected applications release the phone number, so a fresh person (or the
-- same person re-applying) can use it again. Used by the enroll form to give
-- an instant, friendly "this number already has an application" message
-- instead of failing after the photo upload.
CREATE OR REPLACE FUNCTION public.phone_can_apply(_phone TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.membership_applications
    WHERE regexp_replace(_phone, '[^0-9]', '', 'g') = phone
      AND status IN ('pending', 'approved')
  );
$$;

REVOKE ALL ON FUNCTION public.phone_can_apply(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phone_can_apply(TEXT) TO anon, authenticated;
