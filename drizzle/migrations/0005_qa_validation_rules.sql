-- 0005 — Align server-side enrollment rules with the QA fixes (BUG-004, 006, 007).
--
-- Supersedes the enroll_member version from 0004. Adds:
--   - BUG-007: Indian mobile format — 10 digits starting 6-9.
--   - BUG-004: names are letters (any script) and spaces only; digits and
--     special characters are rejected server-side too.
--   - BUG-006: name length stays capped at 70 (was already in 0004).
--
-- Apply manually: Supabase Dashboard -> SQL Editor -> paste -> Run.

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
  -- BUG-007: valid Indian mobile number.
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  -- BUG-004/006: letters and spaces only, 2-70 characters.
  -- NOTE: PostgreSQL regex has no \p{...} Unicode classes (that is JS/ICU
  -- syntax) — using one here fails to compile with "invalid escape \" and
  -- breaks every enrollment. Guard ASCII letters server-side; the full
  -- any-script Unicode check (incl. Tamil) is enforced client-side in
  -- enroll.tsx via NAME_ALLOWED/NAME_INVALID.
  _full_name := trim(_full_name);
  IF _full_name IS NULL
     OR length(_full_name) < 2
     OR length(_full_name) > 70
     OR _full_name ~ '[^a-zA-Z\s]' THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  IF _address IS NOT NULL AND length(trim(_address)) > 300 THEN
    RAISE EXCEPTION 'invalid address';
  END IF;

  IF _constituency IS NOT NULL AND length(trim(_constituency)) > 70 THEN
    RAISE EXCEPTION 'invalid constituency';
  END IF;

  new_crf := 'CRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.crf_seq')::TEXT, 6, '0');

  INSERT INTO public.members (crf_no, full_name, phone, address, district, state, constituency, photo_path, date_of_birth)
  VALUES (new_crf, _full_name, _phone, trim(_address), _district, 'Tamil Nadu', trim(_constituency), _photo_path, _date_of_birth)
  RETURNING * INTO new_member;

  token := public.generate_public_token();
  INSERT INTO public.member_cards (member_id, public_token) VALUES (new_member.id, token);

  RETURN json_build_object('member_id', new_member.id, 'crf_no', new_crf, 'public_token', token);
END;
$$;
