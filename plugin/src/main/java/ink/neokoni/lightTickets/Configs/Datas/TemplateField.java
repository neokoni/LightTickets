package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class TemplateField {
    private String type;
    private String id;
    private boolean required;
    private String label;
    private String description;
    private String placeholder;
    private String value;
    private List<TemplateOption> options;

    public TemplateField(String type, String id, boolean required, String label,
                         String description, String placeholder, String value,
                         List<?> options) {
        this.type = type;
        this.id = id;
        this.required = required;
        this.label = label;
        this.description = description;
        this.placeholder = placeholder;
        this.value = value;
        this.options = options == null ? new java.util.ArrayList<>() : options.stream()
                .map(option -> option instanceof TemplateOption templateOption
                        ? templateOption
                        : new TemplateOption(String.valueOf(option), false))
                .toList();
    }

    public boolean isInputType() {
        return "input".equals(type) || "textarea".equals(type);
    }

    public boolean isSelectType() {
        return "dropdown".equals(type);
    }

    public boolean isMultiSelectType() {
        return "checkboxes".equals(type);
    }
}
