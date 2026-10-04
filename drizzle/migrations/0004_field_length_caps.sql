-- 0004 — Field length caps in enroll_member (matches the form's maxLengths).
--
-- Optional hardening: the form already caps name/constituency at 70 chars and
-- address at 300. This stops oversized values from direct API posts. Existing
-- rows are not touched (no constraints are added to the table).
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
  _phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF _phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  _full_name := trim(_full_name);
  IF _full_name IS NULL OR length(_full_name) < 2 OR length(_full_name) > 70 THEN
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
