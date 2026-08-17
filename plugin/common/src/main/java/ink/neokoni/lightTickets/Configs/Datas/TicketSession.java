package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Getter
@Setter
public class TicketSession {
    public static final long TTL_MILLIS = 10 * 60 * 1_000L;
    private TemplateData template;
    private int step;
    private String title;
    private Map<String, String> formData;
    private String world;
    private int x;
    private int y;
    private int z;
    private String gameMode;
    private boolean includeContext;
    private Boolean hidden;
    private final long createdAtMillis;

    public TicketSession(TemplateData template,
                         String world, int x, int y, int z, String gameMode) {
        this.template = template;
        this.step = 0;
        this.title = null;
        this.formData = new ConcurrentHashMap<>();
        this.world = world;
        this.x = x;
        this.y = y;
        this.z = z;
        this.gameMode = gameMode;
        this.includeContext = false;
        this.hidden = switch (template.getHiddenMode()) {
            case "true" -> true;
            case "false" -> false;
            default -> null;
        };
        this.createdAtMillis = System.currentTimeMillis();
    }

    public boolean isTitleStep() {
        return step == 0;
    }

    public boolean isInfoStep() {
        return step == template.getFields().size() + 1;
    }

    public boolean isVisibilityStep() {
        return "optional".equals(template.getHiddenMode()) && step == template.getFields().size() + 2;
    }

    public boolean isFinished() {
        int lastStep = template.getFields().size() + ("optional".equals(template.getHiddenMode()) ? 2 : 1);
        return step > lastStep;
    }

    public TemplateField currentField() {
        if (step < 1 || step > template.getFields().size()) return null;
        return template.getFields().get(step - 1);
    }

    public boolean isExpired() {
        return System.currentTimeMillis() - createdAtMillis >= TTL_MILLIS;
    }
}
