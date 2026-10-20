-- 0008 — Purge all test data before client handover.
--
-- The site is finished; everything below was created while testing and has to
-- be gone before the client takes over.
--
-- Live schema after 0007. Migration 0003 dropped membership_applications and
-- members.application_id, so only two tables hold test rows:
--   * public.members
--   * public.member_cards          (member_id -> members(id) ON DELETE CASCADE)
-- plus photos in the private `member-photos` bucket.
--
-- WHAT THIS FILE DOES
--   1. Deletes every test member and every member card.
--   2. Rewinds member_number_seq so the first real member is member_number 1
--      (rendered as 000001).
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * Photos. Deleting storage.objects rows directly is blocked by the
--     platform trigger storage.protect_delete() ("Direct deletion from
--     storage tables is not allowed. Use the Storage API instead."), so the
--     photos are removed by the Storage API in a separate script:
--         node scripts/purge-member-photos.mjs --yes
--     That script is independent of this one — neither reads state the other
--     owns, so they can run in either order.
--   * public.card_templates — the client's active template is untouched.
--   * auth.users, public.profiles, public.user_roles — the admin login and any
--     real accounts are untouched.
--   * schema, functions, policies — this migration only deletes rows.
--
-- On the sequence: ALTER SEQUENCE ... RESTART WITH 1 is documented as
-- setval(seq, 1, is_called => false), so the next nextval() returns 1. It can
-- never return 0 — the sequence MINVALUE is 1.
--
-- Apply manually: Supabase Dashboard -> SQL Editor -> paste -> Run. One paste,
-- one transaction: all-or-nothing, never half-cleaned. Safe to re-run — the
-- second run deletes 0 rows and re-sets the same sequence value.

-- ============ 1. BEFORE (informational) ============
SELECT
  (SELECT count(*) FROM public.members)        AS members,
  (SELECT count(*) FROM public.member_cards)   AS member_cards,
  (SELECT count(*) FROM public.card_templates) AS card_templates;

-- ============ 2. DROP THE ROWS ============
-- Children first: member_cards.member_id references members(id) ON DELETE
-- CASCADE, so deleting members would remove them anyway. Deleting them
-- explicitly here makes the counts in step 3 honest rather than pre-cascade.
DELETE FROM public.member_cards;
DELETE FROM public.members;

-- ============ 3. MEMBER NUMBER BACK TO 1 ============
ALTER SEQUENCE public.member_number_seq RESTART WITH 1;

-- ============ 4. AFTER — members and cards 0, templates unchanged ============
SELECT
  (SELECT count(*) FROM public.members)        AS members,
  (SELECT count(*) FROM public.member_cards)   AS member_cards,
  (SELECT count(*) FROM public.card_templates) AS card_templates;

-- last_value = 1, is_called = false  =>  the next nextval() returns 1.
-- Deliberately NOT checked with SELECT nextval(...): that would consume 1 and
-- the first real member would be handed 2 instead.
SELECT last_value, is_called FROM public.member_number_seq;

-- Photo count is not checked here: this file no longer touches storage. The
-- script reports it instead.
