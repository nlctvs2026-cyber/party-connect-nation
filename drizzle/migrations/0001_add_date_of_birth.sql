-- 0001 — Date of birth on applications and members.
--
-- The enrollment form now collects date of birth (required, applicants must be
-- 18+). The value is kept on the member record when the application is
-- approved, and is never exposed by the public verify_card function.
--
-- This project's drizzle config has no live database URL, so apply this file
-- manually: Supabase Dashboard -> SQL Editor -> paste -> Run.

ALTER TABLE public.membership_applications ADD COLUMN date_of_birth DATE;
ALTER TABLE public.members ADD COLUMN date_of_birth DATE;

-- Applicants and members must be at least 18. NULL remains allowed only for
-- rows that existed before this migration.
ALTER TABLE public.membership_applications
  ADD CONSTRAINT membership_applications_dob_adult
  CHECK (date_of_birth IS NULL OR date_of_birth <= (current_date - INTERVAL '18 years'));

ALTER TABLE public.members
  ADD CONSTRAINT members_dob_adult
  CHECK (date_of_birth IS NULL OR date_of_birth <= (current_date - INTERVAL '18 years'));

-- Re-create approval so the date of birth is carried over to the member.
CREATE OR REPLACE FUNCTION public.approve_application(_application_id UUID)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
  new_member public.members%ROWTYPE;
  new_crf TEXT;
  token TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO app FROM public.membership_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application not found'; END IF;
  IF app.status <> 'pending' THEN RAISE EXCEPTION 'application already %', app.status; END IF;

  new_crf := 'CRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.crf_seq')::TEXT, 6, '0');

  INSERT INTO public.members (application_id, crf_no, full_name, phone, address, district, state, constituency, photo_path, date_of_birth)
  VALUES (app.id, new_crf, app.full_name, app.phone, app.address, app.district, app.state, app.constituency, app.photo_path, app.date_of_birth)
  RETURNING * INTO new_member;

  token := public.generate_public_token();
  INSERT INTO public.member_cards (member_id, public_token) VALUES (new_member.id, token);

  UPDATE public.membership_applications
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = app.id;

  RETURN json_build_object('member_id', new_member.id, 'crf_no', new_crf, 'public_token', token);
END;
$$;
