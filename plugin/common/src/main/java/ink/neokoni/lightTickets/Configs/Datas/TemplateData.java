package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class TemplateData {
    private String key;
    private String name;
    private String description;
    private String titlePrefix;
    private List<String> labels;
    private List<TemplateField> fields;
    private String hiddenMode;

    public TemplateData(String key, String name, String description,
                        String titlePrefix, List<String> labels, List<TemplateField> fields,
                        String hiddenMode) {
        this.key = key;
        this.name = name;
        this.description = description;
        this.titlePrefix = titlePrefix;
        this.labels = labels;
        this.fields = fields;
        this.hiddenMode = hiddenMode;
    }
}
