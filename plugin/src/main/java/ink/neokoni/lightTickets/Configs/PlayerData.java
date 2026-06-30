package ink.neokoni.lightTickets.Configs;

import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.SQL.MariadbAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLiteAdapter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PlayerData {
    private static SQLAdapter sqlAdapter;
    private static Map<UUID, PlayerBind> cachedPlayerBind;

    public static void init() {
        String type = Config.getConfig().getStorage().type().toLowerCase();
        sqlAdapter = switch (type) {
            case "mysql" -> new SQLAdapter();
            case "mariadb" -> new MariadbAdapter();
            default -> new SQLiteAdapter();
        };
        cachedPlayerBind = new ConcurrentHashMap<>();
    }

    public static PlayerBind getPlayerBind(Player player, boolean cached, boolean create) {
        UUID uuid = player.getUniqueId();
        if (cached && cachedPlayerBind.containsKey(uuid) && cachedPlayerBind.get(uuid) != null) {
            return cachedPlayerBind.get(uuid);
        }
        PlayerBind bind = sqlAdapter.getPlayerBind(player);
        if (bind == null) {
            if (create) {
                bind = new PlayerBind(player, uuid, player.getName(), null, null, false);
            } else {
                return null;
            }
        }
        setPlayerBind(player, bind);
        return bind;
    }

    public static void setPlayerBind(Player player, @NotNull PlayerBind bind) {
        sqlAdapter.setPlayerBind(player, bind);
        cachedPlayerBind.put(player.getUniqueId(), bind);
    }
}