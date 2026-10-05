/**
 * Membership card template system.
 *
 * A card template is a plain HTML fragment containing `{{placeholder}}` tokens.
 * At render time every token is replaced with the member's data. Unknown tokens
 * are replaced with an empty string so a card never shows raw `{{...}}` text.
 */
export const CARD_PLACEHOLDERS = [
  "name",
  "member_number",
  "cpf_no",
  "posting",
  "date_of_birth",
  "phone",
  "address",
  "district",
  "state",
  "constituency",
  "photo",
  "qr_code",
] as const;

export type CardPlaceholder = (typeof CARD_PLACEHOLDERS)[number];
export type CardValues = Partial<Record<CardPlaceholder, string>>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace every `{{placeholder}}` in the template with escaped member data. */
export function renderCardTemplate(html: string, values: CardValues): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase() as CardPlaceholder;
    const value = values[key];
    return value ? escapeHtml(value) : "";
  });
}

const STYLE_TAG_PATTERN = /<style([^>]*)>([\s\S]*?)<\/style>/gi;

/**
 * Extract `<style>` blocks from a template and scope every rule under a
 * wrapper selector.
 *
 * Templates may be full documents (the client delivers complete HTML files
 * with `:root`, `body`, `*` and element rules). Left as-is, those rules would
 * restyle the whole host page; wrapped, they apply only inside the card.
 * The wrapper selector is repeated (`.tvk-card-scope, .tvk-card-scope *`) so
 * bare element selectors like `body { margin:0 }` become descendant rules
 * instead of being dropped — and a template's own `.card, .card *` selectors
 * keep working, since the prefix only lowers specificity on the left.
 */
export function extractTemplateStyles(html: string): { body: string; css: string } {
  let css = "";
  const body = html.replace(STYLE_TAG_PATTERN, (_match, _attrs, rules: string) => {
    css += `\n${rules}`;
    return "";
  });

  if (!css.trim()) return { body, css: "" };

  // Strip comments, then re-scope: `A { … }` → `SCOPE A, SCOPE { … }`.
  // Splitting on top-level braces handles nested at-rule blocks well enough
  // for card templates while keeping the transform predictable.
  const scoped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/(^|\})\s*([^{}@]+)\s*\{/g, (_m, brace, selector: string) => {
      const scopedSelector = selector
        .trim()
        .split(",")
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return trimmed;
          // :root is meaningless inside a fragment — treat it as the scope.
          if (/^(:root|html|body)$/i.test(trimmed)) return ".tvk-card-scope";
          return `.tvk-card-scope ${trimmed}`;
        })
        .filter(Boolean)
        .join(", ");
      return `${brace} ${scopedSelector} {`;
    });

  return { body, css: scoped };
}

/**
 * Starter template admins can download to design new cards from scratch.
 * It uses every supported placeholder and documents the rules of the format.
 */
export const STARTER_TEMPLATE = `<!--
  Membership card template (starter)

  Edit this file, then upload it in /admin -> Card templates.

  Supported placeholders - each {{token}} is replaced with live member data:
    {{name}}  {{member_number}}  {{cpf_no}}  {{posting}}  {{date_of_birth}}  {{phone}}
    {{address}}  {{district}}  {{state}}  {{constituency}}  {{photo}}  {{qr_code}}

  Notes:
  - Values are HTML-escaped and unknown tokens render as empty text.
  - Use inline styles (style="...") so the card looks identical everywhere.
  - {{photo}} and {{qr_code}} are image URLs - use them in <img src="...">.
-->
<div style="width:560px;font-family:Georgia,serif;color:#261611;background:#F3F0C8;border:6px solid #790604;border-radius:14px;overflow:hidden">
  <div style="display:flex;height:10px"><div style="flex:1;background:#790604"></div><div style="flex:1;background:#246820"></div><div style="flex:1;background:#EBC336"></div></div>
  <div style="padding:16px 20px;background:#790604;color:#F3F0C8">
    <div style="font-size:20px;font-weight:bold;letter-spacing:1px">PARTY MEMBERSHIP CARD</div>
    <div style="font-size:12px;opacity:.85">{{state}}</div>
  </div>
  <div style="display:flex;gap:18px;padding:20px">
    <img src="{{photo}}" alt="photo" style="width:120px;height:150px;object-fit:cover;border:3px solid #EBC336;border-radius:8px;background:#fff" />
    <div style="flex:1;font-size:14px;line-height:1.7">
      <div style="font-size:19px;font-weight:bold;color:#790604">{{name}}</div>
      <div><b>Member No:</b> {{member_number}}</div>
      <div><b>CPF No:</b> {{cpf_no}}</div>
      <div><b>Posting:</b> {{posting}}</div>
      <div><b>Date of birth:</b> {{date_of_birth}}</div>
      <div><b>Phone:</b> {{phone}}</div>
      <div><b>Address:</b> {{address}}</div>
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
</div>
`;

/** Turn a template name into a safe `.html` file name. */
function templateFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "card-template"}.html`;
}

/** Trigger a browser download of a template's HTML source. */
export function downloadCardTemplate(name: string, html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = templateFileName(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Sample data used for admin template previews. */
export const PREVIEW_VALUES: CardValues = {
  name: "Preview Member",
  member_number: "000042",
  cpf_no: "CPF-2026-001001",
  posting: "Member",
  date_of_birth: "1990-06-15",
  phone: "9000000000",
  address: "12, Gandhi Street, Anna Nagar",
  district: "Madurai",
  state: "Tamil Nadu",
  constituency: "Madurai Central",
  photo: "https://placehold.co/240x300/790604/F3F0C8?text=PHOTO",
  qr_code: "https://placehold.co/200x200/261611/FFFFFF?text=QR",
};
