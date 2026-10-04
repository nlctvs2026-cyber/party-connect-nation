-- 0007 — Expose date_of_birth to the card template system
--
-- verify_card now returns the member's date of birth so card templates can
-- use the {{date_of_birth}} placeholder. No other functions change.
--
-- Apply manually: Supabase Dashboard -> SQL Editor -> paste -> Run.

CREATE OR REPLACE FUNCTION public.verify_card(_token TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'valid', (m.is_active AND c.revoked_at IS NULL),
    'full_name', m.full_name,
    'member_number', m.member_number,
    'cpf_no', m.cpf_no,
    'posting', m.posting,
    'date_of_birth', m.date_of_birth,
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
