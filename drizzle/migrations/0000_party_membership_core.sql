-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TEMPLATES ============
CREATE TABLE public.card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  html TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_template ON public.card_templates (is_active) WHERE is_active;
GRANT SELECT ON public.card_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_templates TO authenticated;
GRANT ALL ON public.card_templates TO service_role;
ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active template public read" ON public.card_templates FOR SELECT TO anon, authenticated USING (is_active OR public.is_admin());
CREATE POLICY "admin manage templates" ON public.card_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ APPLICATIONS ============
CREATE TABLE public.membership_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 1),
  phone TEXT NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  address TEXT NOT NULL CHECK (length(trim(address)) > 4),
  district TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu' CHECK (state = 'Tamil Nadu'),
  constituency TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_apps_status ON public.membership_applications(status, created_at DESC);
GRANT INSERT ON public.membership_applications TO anon, authenticated;
GRANT SELECT, UPDATE ON public.membership_applications TO authenticated;
GRANT ALL ON public.membership_applications TO service_role;
ALTER TABLE public.membership_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can apply" ON public.membership_applications FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);
CREATE POLICY "admin read applications" ON public.membership_applications FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin update applications" ON public.membership_applications FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ MEMBERS ============
CREATE SEQUENCE public.crf_seq START 1001;

CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID UNIQUE REFERENCES public.membership_applications(id) ON DELETE SET NULL,
  user_id UUID UNIQUE,
  crf_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  district TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu',
  constituency TEXT NOT NULL,
  photo_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_members_district ON public.members(district);
GRANT SELECT, INSERT, UPDATE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads own" ON public.members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage members" ON public.members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.member_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  public_token TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_cards_token ON public.member_cards(public_token);
GRANT SELECT, INSERT, UPDATE ON public.member_cards TO authenticated;
GRANT ALL ON public.member_cards TO service_role;
ALTER TABLE public.member_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads own card" ON public.member_cards FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid()));
CREATE POLICY "admin manage cards" ON public.member_cards FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ TOKEN GENERATION ============
CREATE OR REPLACE FUNCTION public.generate_public_token()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  token TEXT;
  i INT;
BEGIN
  LOOP
    token := '';
    FOR i IN 1..14 LOOP
      token := token || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.member_cards WHERE public_token = token);
  END LOOP;
  RETURN token;
END;
$$;

-- ============ APPROVE / REJECT ============
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

  INSERT INTO public.members (application_id, crf_no, full_name, phone, address, district, state, constituency, photo_path)
  VALUES (app.id, new_crf, app.full_name, app.phone, app.address, app.district, app.state, app.constituency, app.photo_path)
  RETURNING * INTO new_member;

  token := public.generate_public_token();
  INSERT INTO public.member_cards (member_id, public_token) VALUES (new_member.id, token);

  UPDATE public.membership_applications
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = app.id;

  RETURN json_build_object('member_id', new_member.id, 'crf_no', new_crf, 'public_token', token);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_application(_application_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.membership_applications
    SET status = 'rejected', review_notes = _notes, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _application_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'application not pending'; END IF;
END;
$$;

-- ============ PUBLIC VERIFICATION (minimum data only) ============
CREATE OR REPLACE FUNCTION public.verify_card(_token TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'valid', (m.is_active AND c.revoked_at IS NULL),
    'full_name', m.full_name,
    'crf_no', m.crf_no,
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
GRANT EXECUTE ON FUNCTION public.approve_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_application(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- ============ STORAGE POLICIES ============
CREATE POLICY "public can upload application photos" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = 'applications');
CREATE POLICY "admin reads member photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND public.is_admin());
CREATE POLICY "admin manages member photos" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'member-photos' AND public.is_admin()) WITH CHECK (bucket_id = 'member-photos' AND public.is_admin());

-- ============ DEFAULT TEMPLATE ============
INSERT INTO public.card_templates (name, html, is_active) VALUES (
'Classic Red & Gold',
'<div style="width:560px;font-family:Georgia,serif;color:#261611;background:#F3F0C8;border:6px solid #790604;border-radius:14px;overflow:hidden">
  <div style="display:flex;height:10px"><div style="flex:1;background:#790604"></div><div style="flex:1;background:#246820"></div><div style="flex:1;background:#EBC336"></div></div>
  <div style="padding:16px 20px;background:#790604;color:#F3F0C8">
    <div style="font-size:20px;font-weight:bold;letter-spacing:1px">PARTY MEMBERSHIP CARD</div>
    <div style="font-size:12px;opacity:.85">{{state}}</div>
  </div>
  <div style="display:flex;gap:18px;padding:20px">
    <img src="{{photo}}" alt="photo" style="width:120px;height:150px;object-fit:cover;border:3px solid #EBC336;border-radius:8px;background:#fff" />
    <div style="flex:1;font-size:14px;line-height:1.7">
      <div style="font-size:19px;font-weight:bold;color:#790604">{{name}}</div>
      <div><b>CRF No:</b> {{crf_no}}</div>
      <div><b>District:</b> {{district}}</div>
      <div><b>Constituency:</b> {{constituency}}</div>
      <div><b>State:</b> {{state}}</div>
    </div>
    <div style="text-align:center">
      <img src="{{qr_code}}" alt="qr" style="width:96px;height:96px" />
      <div style="font-size:9px;color:#693E2C;margin-top:4px">Scan to verify</div>
    </div>
  </div>
  <div style="display:flex;height:8px"><div style="flex:1;background:#790604"></div><div style="flex:1;background:#246820"></div><div style="flex:1;background:#EBC336"></div></div>
</div>', true);
