export const PHONE_PATTERN = /^0\d{8,9}$/
export const NAME_MAX_LENGTH = 50
export const COMMENT_MAX_LENGTH = 2000

export function normalizePhoneText(text) {
  return text.replace(/[\s\-()]/g, '')
}
