export const TEMPLATE_HIDDEN_MODE = {
  HIDDEN: true,
  PUBLIC: false,
  OPTIONAL: 'optional',
} as const;

export type TemplateHiddenMode =
  | typeof TEMPLATE_HIDDEN_MODE.HIDDEN
  | typeof TEMPLATE_HIDDEN_MODE.PUBLIC
  | typeof TEMPLATE_HIDDEN_MODE.OPTIONAL;
