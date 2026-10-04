-- 0003 — Instant membership: remove the approval/rejection flow.
--
-- The client wants the card shown immediately after enrollment. The phone
-- number is already unique, so duplicates are prevented at the source and no
-- office review is needed:
--
--   1. Every still-pending application is converted into a member + card, so
--      nobody loses their place (approved/rejected rows are dropped with the
--      table — approved ones already have a member).
--   2. `enroll_member` replaces `approve_application`: an anonymous visitor
--      submits their details and the database creates the member, CRF number
--      and card token in one transaction. The form redirects straight to the
--      card page.
--   3. `membership_applications` and members.application_id are dropped, along
--      with the approve/reject functions and the pending/rejected tracking
--      states. Tracking now simply finds the member (and their card) by phone.
--
-- Apply manually: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- ============ 1. CONVERT PENDING APPLICATIONS TO MEMBERS ============
DO $$
DECLARE
  app RECORD;
  new_id UUID;
  new_crf TEXT;
  token TEXT;
BEGIN
  FOR app IN
    SELECT * FROM public.membership_applications
    WHERE status = 'pending'
    ORDER BY created_at ASC
  LOOP
    -- Skip applications whose phone is already a member (pre-unique-index duplicates).
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.members WHERE phone = app.phone);

    new_crf := 'CRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.crf_seq')::TEXT, 6, '0');
    INSERT INTO public.members (crf_no, full_name, phone, address, district, state, constituency, photo_path, date_of_birth)
    VALUES (new_crf, app.full_name, app.phone, app.address, app.district, app.state, app.constituency, app.photo_path, app.date_of_birth)
    RETURNING id INTO new_id;

    token := public.generate_public_token();
    INSERT INTO public.member_cards (member_id, public_token) VALUES (new_id, token);
  END LOOP;
END $$;

-- ============ 2. UNIQUE PHONE ON MEMBERS ============
-- Pre-0002 data can contain duplicate phones (the old flow had no uniqueness).
-- Keep the earliest member per number; mark later ones with a suffix so the
-- unique constraint can be created. Those rows keep all their data and can be
-- merged or fixed by an admin.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
  FROM public.members
)
UPDATE public.members m
SET phone = m.phone || '-dup-' || substr(m.id::TEXT, 1, 4)
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

ALTER TABLE public.members ADD CONSTRAINT members_phone_unique UNIQUE (phone);

-- ============ 3. ENROLLMENT (PUBLIC, ONE TRANSACTION) ============
CREATE OR REPLACE FUNCTION public.enroll_member(
  _full_name TEXT,
  _phone TEXT,
  _address TEXT,
  _district TEXT,
  _constituency TEXT,
  _date_of_birth DATE,
  _photo_path TEXT
)
RETURNS JSON
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_member public.members%ROWTYPE;
  new_crf TEXT;
  token TEXT;
BEGIN
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  IF _full_name IS NULL OR length(trim(_full_name)) < 2 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  new_crf := 'CRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.crf_seq')::TEXT, 6, '0');

  INSERT INTO public.members (crf_no, full_name, phone, address, district, state, constituency, photo_path, date_of_birth)
  VALUES (new_crf, trim(_full_name), _phone, trim(_address), _district, 'Tamil Nadu', trim(_constituency), _photo_path, _date_of_birth)
  RETURNING * INTO new_member;

  token := public.generate_public_token();
  INSERT INTO public.member_cards (member_id, public_token) VALUES (new_member.id, token);

  RETURN json_build_object('member_id', new_member.id, 'crf_no', new_crf, 'public_token', token);
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_member(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_member(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) TO anon, authenticated;

-- ============ 4. TRACKING NOW READS MEMBERS DIRECTLY ============
CREATE OR REPLACE FUNCTION public.track_application(_phone TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD;
BEGIN
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[0-9]{10}$' THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  SELECT mem.full_name, mem.crf_no, mem.district, mem.constituency, mem.joined_at, c.public_token
  INTO m
  FROM public.members mem
  JOIN public.member_cards c ON c.member_id = mem.id AND c.revoked_at IS NULL
  WHERE mem.phone = _phone
  ORDER BY mem.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  RETURN json_build_object(
    'status', 'member',
    'full_name', m.full_name,
    'crf_no', m.crf_no,
    'district', m.district,
    'constituency', m.constituency,
    'joined_at', m.joined_at,
    'public_token', m.public_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.track_application(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_application(TEXT) TO anon, authenticated;

-- Phone availability is now simply "not a member yet".
CREATE OR REPLACE FUNCTION public.phone_can_apply(_phone TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE regexp_replace(_phone, '[^0-9]', '', 'g') = phone
  );
$$;

REVOKE ALL ON FUNCTION public.phone_can_apply(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phone_can_apply(TEXT) TO anon, authenticated;

-- ============ 5. REMOVE THE APPROVAL FLOW ============
-- Drop the referencing column first, then the table (pending apps were
-- converted in step 1; approved rows already have their member).
ALTER TABLE public.members DROP COLUMN IF EXISTS application_id;
DROP FUNCTION IF EXISTS public.approve_application(UUID);
DROP FUNCTION IF EXISTS public.reject_application(UUID, TEXT);
DROP TABLE IF EXISTS public.membership_applications;
