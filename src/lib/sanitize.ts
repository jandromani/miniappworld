import sanitizeHtml from 'sanitize-html';

const BASE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: [],
  allowedSchemesByTag: {},
  disallowedTagsMode: 'discard',
};

export function sanitizeText(value: string): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  return sanitizeHtml(trimmed, BASE_SANITIZE_OPTIONS);
}
