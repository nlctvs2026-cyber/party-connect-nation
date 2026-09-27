# Constituency list backup (BUG-015, 2026-09-27)

src/lib/constants.ts previously contained TAMIL_NADU_CONSTITUENCIES: a 234-seat
assembly-constituency map over the 38 revenue districts (compiled from the
Delimitation Order 2008 list), used by the enroll form's linked
district -> constituency dropdowns.

QA BUG-015 renamed the field to பகுதி (pagudhi) and switched it to a free-text
input, so the map is no longer used and was removed from constants.ts.

## To restore the dropdown version

1. Copy the TAMIL_NADU_CONSTITUENCIES const from
   backup/constants-with-constituency-list.ts back into src/lib/constants.ts.
2. In src/routes/enroll.tsx, re-import TAMIL_NADU_CONSTITUENCIES, restore the
   controlled <select> for constituency (filtered by the chosen district) and
   the districtConstituencies lookup + setConstituency("") reset on district
   change (see git history: BUG-008 implementation).
3. Restore the i18n keys enroll.constituencySelect / enroll.constituencyPickDistrict
   in language-en.json / language-ta.json (values: "Select constituency" /
   "Select a district first"; TA: "தொகுதியைத் தேர்ந்தெடுக்கவும்" /
   "முதலில் மாவட்டத்தைத் தேர்ந்தெடுக்கவும்").

The backup file is a snapshot, NOT imported anywhere. Sanity data (as of
backup): 38 districts, 234 ACs total, no empty lists.
