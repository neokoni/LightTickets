package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;
import org.bukkit.entity.Player;

import java.util.UUID;

@Getter
@Setter
public class PlayerBind {
    private Player player;
    private UUID uuid;
    private String mcName;
    private String bindCode;
    private String codeExpiresAt;
    private boolean bound;
    private String role;

    public PlayerBind(Player player, UUID uuid, String mcName, String bindCode, String codeExpiresAt, boolean bound, String role) {
        this.player = player;
        this.uuid = uuid;
        this.mcName = mcName;
        this.bindCode = bindCode;
        this.codeExpiresAt = codeExpiresAt;
        this.bound = bound;
        this.role = role;
    }
}
