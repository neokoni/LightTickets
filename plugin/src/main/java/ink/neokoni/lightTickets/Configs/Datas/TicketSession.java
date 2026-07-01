package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Getter
@Setter
public class TicketSession {
    private Player player;
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

    public TicketSession(Player player, TemplateData template,
                         String world, int x, int y, int z, String gameMode) {
        this.player = player;
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
    }

    public boolean isTitleStep() {
        return step == 0;
    }

    public boolean isInfoStep() {
        return step == template.getFields().size() + 1;
    }

    public boolean isFinished() {
        return step > template.getFields().size() + 1;
    }

    public TemplateField currentField() {
        if (step < 1 || step > template.getFields().size()) return null;
        return template.getFields().get(step - 1);
    }
}
