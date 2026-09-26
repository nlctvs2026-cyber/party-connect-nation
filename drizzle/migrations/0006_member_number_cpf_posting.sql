-- 0006 — Member number, CPF number, posting
--
-- Three client requests:
--   1. members.member_number: auto-generated number, 1, 2, 3, ... rendered
--      zero-padded to 6 digits (000001, 000002, ...) ordered by join date.
--      Backfilled for existing members; new members get the next value from
--      the member_number_seq sequence automatically.
--   2. crf_no is renamed to cpf_no (the client clarified it is "CPF", not
--      "CRF") and stored values are rewritten CRF-... -> CPF-.... The number
--      is now PROVIDED by the applicant in the enroll form instead of being
--      generated, so the crf_seq sequence is dropped.
--   3. members.posting: posting captured in the enroll form (Member,
--      Sub-leader, ...). Optional; NULL when not chosen.
--
-- enroll_member, track_application and verify_card are rewritten for the new
-- shape. Apply manually: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- ============ 1. MEMBER NUMBER ============
CREATE SEQUENCE IF NOT EXISTS public.member_number_seq START 1;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_number INT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS posting TEXT;

-- Backfill: the oldest member gets 000001. One pass over the table, ordered
-- deterministically so the numbers are stable.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at ASC, created_at ASC, id ASC) AS rn
  FROM public.members
)
UPDATE public.members m SET member_number = ordered.rn FROM ordered WHERE m.id = ordered.id;

ALTER TABLE public.members ALTER COLUMN member_number SET NOT NULL;
ALTER TABLE public.members ALTER COLUMN member_number SET DEFAULT nextval('public.member_number_seq');
-- Continue the sequence after the backfilled rows.
SELECT setval('public.member_number_seq', (SELECT COALESCE(MAX(member_number), 0) FROM public.members));
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_member_number ON public.members(member_number);

-- ============ 2. CRF -> CPF ============
ALTER TABLE public.members RENAME COLUMN crf_no TO cpf_no;
UPDATE public.members SET cpf_no = 'CPF' || substr(cpf_no, 4) WHERE cpf_no LIKE 'CRF-%';
DROP SEQUENCE IF EXISTS public.crf_seq;

-- Card templates: swap the {{crf_no}} placeholder for {{cpf_no}} and the
-- visible "CRF" label for "CPF" in every stored template.
UPDATE public.card_templates
SET html = replace(replace(html, '{{crf_no}}', '{{cpf_no}}'), 'CRF', 'CPF');

-- ============ 3. ENROLL MEMBER (CPF provided by the applicant) ============
DROP FUNCTION IF EXISTS public.enroll_member(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.enroll_member(
  _full_name TEXT,
  _phone TEXT,
  _address TEXT,
  _district TEXT,
  _constituency TEXT,
  _date_of_birth DATE,
  _photo_path TEXT,
  _cpf_no TEXT,
  _posting TEXT
)
RETURNS JSON
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_member public.members%ROWTYPE;
  token TEXT;
BEGIN
  -- Valid Indian mobile number.
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  -- Letters and spaces only, 2-70 characters (ASCII guard; the full
  -- any-script check incl. Tamil runs client-side — PostgreSQL regex has no
  -- \p{...} classes, see the 0005 fix).
  _full_name := trim(_full_name);
  IF _full_name IS NULL
     OR length(_full_name) < 2
     OR length(_full_name) > 70
     OR _full_name ~ '[^a-zA-Z\s]' THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  -- CPF number is provided by the applicant.
  _cpf_no := upper(trim(coalesce(_cpf_no, '')));
  IF _cpf_no = '' THEN
    RAISE EXCEPTION 'invalid cpf';
  END IF;

  -- Posting is optional; store NULL when not chosen.
  _posting := NULLIF(trim(coalesce(_posting, '')), '');

  IF _address IS NOT NULL AND length(trim(_address)) > 300 THEN
    RAISE EXCEPTION 'invalid address';
  END IF;

  IF _constituency IS NOT NULL AND length(trim(_constituency)) > 70 THEN
    RAISE EXCEPTION 'invalid constituency';
  END IF;

  -- member_number comes from the column default (member_number_seq).
  BEGIN
    INSERT INTO public.members (full_name, phone, address, district, state, constituency, photo_path, date_of_birth, cpf_no, posting)
    VALUES (_full_name, _phone, trim(_address), _district, 'Tamil Nadu', trim(_constituency), _photo_path, _date_of_birth, _cpf_no, _posting)
    RETURNING * INTO new_member;
  EXCEPTION
    WHEN unique_violation THEN
      -- Either the CPF number or the phone number hit its unique constraint.
      IF EXISTS (SELECT 1 FROM public.members WHERE cpf_no = _cpf_no) THEN
        RAISE EXCEPTION 'cpf already in use';
      END IF;
      RAISE EXCEPTION 'phone already enrolled';
  END;

  token := public.generate_public_token();
  INSERT INTO public.member_cards (member_id, public_token) VALUES (new_member.id, token);

  RETURN json_build_object(
    'member_id', new_member.id,
    'member_number', new_member.member_number,
    'cpf_no', new_member.cpf_no,
    'public_token', token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_member(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_member(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.member_number_seq TO anon, authenticated, service_role;

-- ============ 4. TRACKING RETURNS THE NEW FIELDS ============
CREATE OR REPLACE FUNCTION public.track_application(_phone TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD;
BEGIN
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[0-9]{10}$' THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  SELECT mem.full_name, mem.cpf_no, mem.member_number, mem.posting, mem.district, mem.constituency, mem.joined_at, c.public_token
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
    'member_number', m.member_number,
    'cpf_no', m.cpf_no,
    'posting', m.posting,
    'district', m.district,
    'constituency', m.constituency,
    'joined_at', m.joined_at,
    'public_token', m.public_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.track_application(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_application(TEXT) TO anon, authenticated;

-- ============ 5. VERIFICATION RETURNS THE NEW FIELDS ============
CREATE OR REPLACE FUNCTION public.verify_card(_token TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'valid', (m.is_active AND c.revoked_at IS NULL),
    'full_name', m.full_name,
    'member_number', m.member_number,
    'cpf_no', m.cpf_no,
    'posting', m.posting,
    'district', m.district,
    'state', m.state,
    'constituency', m.constituency,
    'photo_path', m.photo_path,
    'issued_at', c.issued_at,
    'public_token', c.public_token
  )
  FROM public.member_cards c
  JOIN public.members m ON m.id = c.member_id
  WHERE c.public_token = _token;
$$;

REVOKE ALL ON FUNCTION public.verify_card(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_card(TEXT) TO anon, authenticated;
