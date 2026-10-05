import { randomUUID } from 'node:crypto';

const PATTERNS = [
  ['EMAIL', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['PHONE', /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g],
  ['ID', /(?<!\d)\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g],
];

export function redactSensitiveText(value, namespace = randomUUID()) {
  let text = String(value ?? '');
  const replacements = new Map();
  let sequence = 0;
  for (const [kind, pattern] of PATTERNS) {
    text = text.replace(pattern, (match) => {
      const placeholder = `[[QIUZHI_${namespace}_${kind}_${sequence += 1}]]`;
      replacements.set(placeholder, match);
      return placeholder;
    });
  }
  return { text, replacements };
}

export function restoreSensitiveText(value, replacements) {
  let text = String(value ?? '');
  for (const [placeholder, original] of replacements) text = text.split(placeholder).join(original);
  return text;
}

export function redactAiMessages(messages) {
  const replacements = new Map();
  const redactValue = (value) => {
    if (typeof value === 'string') {
      // Images cannot be text-redacted; callers must obtain separate OCR consent.
      if (value.startsWith('data:image/')) return value;
      const redacted = redactSensitiveText(value);
      for (const entry of redacted.replacements) replacements.set(...entry);
      return redacted.text;
    }
    if (Array.isArray(value)) return value.map(redactValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child)]));
    }
    return value;
  };
  return { messages: redactValue(messages), replacements };
}

export function restoreAiResult(value, replacements) {
  if (typeof value === 'string') return restoreSensitiveText(value, replacements);
  if (Array.isArray(value)) return value.map((item) => restoreAiResult(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreAiResult(child, replacements)]));
  }
  return value;
}
