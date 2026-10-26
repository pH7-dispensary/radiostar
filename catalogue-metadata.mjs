export const decodeHtmlEntity = (value) =>
  String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    const named = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" };
    if (named[token.toLowerCase()] !== undefined) return named[token.toLowerCase()];
    const code = token[1]?.toLowerCase() === "x" ? Number.parseInt(token.slice(2), 16) : token[0] === "#" ? Number.parseInt(token.slice(1), 10) : NaN;
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
export const cleanMetadata = (s) =>
  decodeHtmlEntity(String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, ""))
    .trim();
