import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

export function sanitizeUserText(value?: unknown) {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return sanitizeHtml(trimmed, SANITIZE_OPTIONS);
}

export function validateUserText(
  value: unknown,
  options: { field: string; min?: number; max?: number }
): { valid: boolean; sanitized?: string; error?: string } {
  const sanitized = sanitizeUserText(value);

  if (!sanitized) {
    return { valid: false, error: `${options.field} es obligatorio` };
  }

  if (options.min && sanitized.length < options.min) {
    return { valid: false, error: `${options.field} debe tener al menos ${options.min} caracteres` };
  }

  if (options.max && sanitized.length > options.max) {
    return { valid: false, error: `${options.field} debe tener máximo ${options.max} caracteres` };
  }

  return { valid: true, sanitized };
}

export function validateHttpUrl(value?: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return { valid: false, error: 'URL de avatar inválida' };
  }

  try {
    const parsed = new URL(value.trim());
    const protocol = parsed.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { valid: false, error: 'La URL debe usar http o https' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch (error) {
    return { valid: false, error: 'URL de avatar inválida' };
  }
}
