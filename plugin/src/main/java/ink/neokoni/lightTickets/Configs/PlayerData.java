package ink.neokoni.lightTickets.Configs;

import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.SQL.MariadbAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLiteAdapter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PlayerData {
    private static SQLAdapter sqlAdapter;
    private static Map<UUID, PlayerBind> cachedPlayerBind;
    private static Map<UUID, List<CachedTicket>> cachedTicketList;

    public static void init() {
        String type = Config.getConfig().getStorage().type().toLowerCase();
        sqlAdapter = switch (type) {
            case "mysql" -> new SQLAdapter();
            case "mariadb" -> new MariadbAdapter();
            default -> new SQLiteAdapter();
        };
        cachedPlayerBind = new ConcurrentHashMap<>();
        cachedTicketList = new ConcurrentHashMap<>();
    }

    public static void reload() {
        if (sqlAdapter != null) {
            sqlAdapter.close();
        }
        init();
    }

    public static PlayerBind getPlayerBind(Player player, boolean cached, boolean create) {
        UUID uuid = player.getUniqueId();
        if (cached && cachedPlayerBind.containsKey(uuid) && cachedPlayerBind.get(uuid) != null) {
            return cachedPlayerBind.get(uuid);
        }
        PlayerBind bind = sqlAdapter.getPlayerBind(player);
        if (bind == null) {
            if (create) {
                bind = new PlayerBind(player, uuid, player.getName(), null, null, false, "player");
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

    public static List<CachedTicket> getTicketList(UUID playerUuid) {
        List<CachedTicket> list = cachedTicketList.get(playerUuid);
        return list != null ? list : new ArrayList<>();
    }

    public static void setTicketList(UUID playerUuid, List<CachedTicket> tickets) {
        cachedTicketList.put(playerUuid, tickets);
    }

    public static void removePlayerData(UUID playerUuid) {
        cachedPlayerBind.remove(playerUuid);
        cachedTicketList.remove(playerUuid);
    }

    public record CachedTicket(int id, String title, String status, String createdAt) {}
}
