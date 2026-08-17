package ink.neokoni.lightTickets.Configs;

import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.SQL.MariadbAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLAdapter;
import ink.neokoni.lightTickets.Configs.SQL.SQLiteAdapter;
import ink.neokoni.lightTickets.Utils.AccountRole;
import ink.neokoni.lightTickets.Utils.PlayerSessionManager;
import ink.neokoni.lightTickets.platform.LightPlayer;
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
        PlayerSessionManager.clearAll();
    }

    public static void reload() {
        if (sqlAdapter != null) {
            sqlAdapter.close();
        }
        init();
    }

    public static PlayerBind getPlayerBind(LightPlayer player, boolean cached, boolean create) {
        UUID uuid = player.getUniqueId();
        if (cached && cachedPlayerBind.containsKey(uuid) && cachedPlayerBind.get(uuid) != null) {
            return cachedPlayerBind.get(uuid);
        }
        PlayerBind bind = sqlAdapter.getPlayerBind(uuid);
        if (bind == null) {
            if (create) {
                bind = new PlayerBind(uuid, player.getName(), null, null, false, AccountRole.PLAYER, null);
            } else {
                return null;
            }
        }
        setPlayerBind(player, bind);
        return bind;
    }

    public static boolean hasPlayerCredential(LightPlayer player) {
        PlayerBind bind = getPlayerBind(player, true, false);
        if (bind == null) return false;
        String credential = bind.getPlayerCredential();
        return credential != null && !credential.isBlank();
    }

    public static void setPlayerBind(LightPlayer player, @NotNull PlayerBind bind) {
        sqlAdapter.setPlayerBind(bind);
        cachedPlayerBind.put(
          player.getUniqueId(),
          new PlayerBind(
            bind.getUuid(), bind.getMcName(),
            bind.getBindCode(), bind.getCodeExpiresAt(), bind.isBound(),
            bind.getRole(), bind.getPlayerCredential()
          ));
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
        PlayerSessionManager.invalidate(playerUuid);
    }

    public static void clearAll() {
        cachedPlayerBind.clear();
        cachedTicketList.clear();
        PlayerSessionManager.clearAll();
    }

    public static boolean claimHookExecution(String hookId) {
        return sqlAdapter.claimHookReceipt(hookId);
    }

    public static void releaseHookExecution(String hookId) {
        sqlAdapter.releaseHookReceipt(hookId);
    }

    public record CachedTicket(int id, String title, String status, String createdAt) {}
}
