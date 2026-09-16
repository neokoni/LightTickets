export interface ParsedTemplateOption {
  label: string;
  value: string;
}

export function parseTemplateOption(option: unknown): ParsedTemplateOption {
  const raw =
    typeof option === 'string'
      ? option
      : String(
          (typeof option === 'object' && option !== null && 'label' in option
            ? option.label
            : undefined) ?? '',
        );
  const separator = raw.indexOf('|');
  return {
    label: separator >= 0 ? raw.slice(0, separator) : raw,
    value: separator >= 0 ? raw.slice(separator + 1) : raw,
  };
}
