package ink.neokoni.lightTickets.Configs.Datas;

import ink.neokoni.lightTickets.Utils.AccountRole;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
public class PlayerBind {
    private UUID uuid;
    private String mcName;
    private String bindCode;
    private String codeExpiresAt;
    private boolean bound;
    private AccountRole role;
    private String playerCredential;

    public PlayerBind(UUID uuid, String mcName, String bindCode, String codeExpiresAt,
                      boolean bound, AccountRole role, String playerCredential) {
        this.uuid = uuid;
        this.mcName = mcName;
        this.bindCode = bindCode;
        this.codeExpiresAt = codeExpiresAt;
        this.bound = bound;
        this.role = role;
        this.playerCredential = playerCredential;
    }
}
