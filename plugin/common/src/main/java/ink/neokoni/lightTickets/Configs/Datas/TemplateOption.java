package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;

@Getter
public class TemplateOption {
    private final String label;
    private final boolean required;

    public TemplateOption(String label, boolean required) {
        this.label = label;
        this.required = required;
    }
}
