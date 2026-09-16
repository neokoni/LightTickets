package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;

@Getter
public class TemplateOption {
    private final String label;
    private final String value;
    private final boolean required;

    public TemplateOption(String label, boolean required, boolean parseValue) {
        int separator = parseValue ? label.indexOf('|') : -1;
        this.label = separator >= 0 ? label.substring(0, separator) : label;
        this.value = separator >= 0 ? label.substring(separator + 1) : label;
        this.required = required;
    }
}
