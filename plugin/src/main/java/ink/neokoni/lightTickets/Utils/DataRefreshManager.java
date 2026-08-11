package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.AccountRole;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;

public class DataRefreshManager {
    private static final Queue<UUID> refreshQueue = new ConcurrentLinkedQueue<>();
    private static final Set<UUID> queuedPlayers = ConcurrentHashMap.newKeySet();
    private static final Set<UUID> inFlightPlayers = ConcurrentHashMap.newKeySet();
    private static final Set<UUID> activePlayers = ConcurrentHashMap.newKeySet();
    private static final Map<UUID, Long> lastRefreshTime = new ConcurrentHashMap<>();
    private static final Map<UUID, Integer> retryAttempts = new ConcurrentHashMap<>();
    private static final Map<UUID, Long> retryAfter = new ConcurrentHashMap<>();

    private enum AccountRefreshResult {
        UPDATED,
        UNBOUND,
        RETRY
    }

    public static void start() {
        int intervalMinutes = Config.getConfig().getPlayerRefreshInterval();
        if (intervalMinutes <= 0) return;

        Bukkit.getAsyncScheduler().runAtFixedRate(LightTickets.getInstance(),
                task -> processOne(), 3, 3, TimeUnit.SECONDS);

        LightTickets.getInstance().getLogger().info(LangUtils.getRawLang("data_refresh.started",
                Map.of("{interval}", String.valueOf(intervalMinutes))));
    }

    public static void onPlayerJoin(UUID uuid) {
        if (activePlayers.add(uuid)) {
            lastRefreshTime.remove(uuid);
            retryAttempts.remove(uuid);
            retryAfter.remove(uuid);
            enqueue(uuid);
        }
    }

    public static void onPlayerQuit(UUID uuid) {
        activePlayers.remove(uuid);
        queuedPlayers.remove(uuid);
        refreshQueue.remove(uuid);
        lastRefreshTime.remove(uuid);
        retryAttempts.remove(uuid);
        retryAfter.remove(uuid);
    }

    public static void requestRefresh(UUID uuid) {
        if (uuid == null || !activePlayers.contains(uuid)) return;
        lastRefreshTime.remove(uuid);
        retryAttempts.remove(uuid);
        retryAfter.remove(uuid);
        enqueue(uuid);
    }

    public static void refreshNow(UUID uuid) {
        if (uuid == null || Bukkit.getPlayer(uuid) == null) return;
        if (!inFlightPlayers.add(uuid)) return;
        try {
            AccountRefreshResult result = doRefresh(uuid);
            if (result != AccountRefreshResult.RETRY) {
                lastRefreshTime.put(uuid, System.currentTimeMillis());
                retryAttempts.remove(uuid);
                retryAfter.remove(uuid);
            } else {
                scheduleRetry(uuid);
            }
        } finally {
            inFlightPlayers.remove(uuid);
            enqueue(uuid);
        }
    }

    public static void shutdown() {
        refreshQueue.clear();
        queuedPlayers.clear();
        inFlightPlayers.clear();
        activePlayers.clear();
        lastRefreshTime.clear();
        retryAttempts.clear();
        retryAfter.clear();
    }

    private static void processOne() {
        UUID uuid = refreshQueue.poll();
        if (uuid == null) return;
        queuedPlayers.remove(uuid);

        if (!activePlayers.contains(uuid) || Bukkit.getPlayer(uuid) == null) {
            activePlayers.remove(uuid);
            return;
        }
        if (!inFlightPlayers.add(uuid)) return;

        try {
            long now = System.currentTimeMillis();
            Long blockedUntil = retryAfter.get(uuid);
            if (blockedUntil != null && now < blockedUntil) return;

            Long last = lastRefreshTime.get(uuid);
            long intervalMs = Config.getConfig().getPlayerRefreshInterval() * 1_000L;
            if (last != null && (now - last) < intervalMs) return;

            AccountRefreshResult result = doRefresh(uuid);
            if (result == AccountRefreshResult.RETRY) {
                scheduleRetry(uuid);
            } else {
                lastRefreshTime.put(uuid, now);
                retryAttempts.remove(uuid);
                retryAfter.remove(uuid);
            }
        } finally {
            inFlightPlayers.remove(uuid);
            enqueue(uuid);
        }
    }

    private static void enqueue(UUID uuid) {
        if (activePlayers.contains(uuid) && queuedPlayers.add(uuid)) {
            refreshQueue.add(uuid);
        }
    }

    private static void scheduleRetry(UUID uuid) {
        int attempt = Math.min(retryAttempts.merge(uuid, 1, Integer::sum), 6);
        long delay = Math.min(60_000L, 1_000L << attempt);
        retryAfter.put(uuid, System.currentTimeMillis() + delay);
    }

    private static AccountRefreshResult doRefresh(UUID uuid) {
        AccountRefreshResult accountResult = AccountRefreshResult.RETRY;
        try {
            accountResult = refreshAccountInfo(uuid);
        } catch (Exception e) {
            LogUtils.warning("data_refresh.account_failed",
                    Map.of("{uuid}", uuid.toString(), "{message}", LogUtils.exceptionText(e)));
        }

        try {
            refreshTicketList(uuid);
        } catch (Exception e) {
            LogUtils.warning("data_refresh.tickets_failed",
                    Map.of("{uuid}", uuid.toString(), "{message}", LogUtils.exceptionText(e)));
        }
        return accountResult;
    }

    private static AccountRefreshResult refreshAccountInfo(UUID uuid) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null) return AccountRefreshResult.RETRY;
        HttpUtils.Resp resp = ApiClient.requestWithStatusForPlayer(player, ApiEndpoint.MC_USER,
                Map.of("uuid", uuid.toString()), null, null, false);
        if (resp == null) return AccountRefreshResult.RETRY;

        if (resp.status() == 404) {
            updateBindStatus(uuid, false, AccountRole.PLAYER);
            return AccountRefreshResult.UNBOUND;
        }
        if (resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) {
            return AccountRefreshResult.RETRY;
        }

        AccountRole role = AccountRole.PLAYER;
        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed == null) return AccountRefreshResult.RETRY;
        if (parsed.has("role") && !parsed.get("role").isJsonNull()) {
            role = AccountRole.fromKey(parsed.get("role").getAsString());
        }
        updateBindStatus(uuid, true, role);
        return AccountRefreshResult.UPDATED;
    }

    private static void refreshTicketList(UUID uuid) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null) return;
        String resp = ApiClient.getForPlayer(player, ApiEndpoint.MC_TICKET_LIST,
                null,
                Map.of("minecraftUuid", uuid.toString(), "page", "1", "pageSize", "10"));
        if (resp == null || resp.isEmpty()) return;

        JsonObject parsed = JsonUtils.fromJson(resp, JsonObject.class);
        if (parsed == null || !parsed.has("tickets")) return;

        JsonArray tickets = parsed.getAsJsonArray("tickets");
        List<PlayerData.CachedTicket> cached = new ArrayList<>();

        for (JsonElement el : tickets) {
            JsonObject t = el.getAsJsonObject();
            int id = t.has("id") ? t.get("id").getAsInt() : 0;
            String title = t.has("title") ? t.get("title").getAsString() : "";
            String status = t.has("status") ? t.get("status").getAsString() : "";
            String createdAt = t.has("createdAt") ? t.get("createdAt").getAsString() : "";
            cached.add(new PlayerData.CachedTicket(id, title, status, createdAt));
        }

        PlayerData.setTicketList(uuid, cached);
    }

    private static void updateBindStatus(UUID uuid, boolean bound, AccountRole role) {
        org.bukkit.entity.Player player = Bukkit.getPlayer(uuid);
        if (player == null) return;

        PlayerBind existing = PlayerData.getPlayerBind(player, true, true);
        existing.setBound(bound);
        existing.setRole(role == null ? AccountRole.PLAYER : role);
        PlayerData.setPlayerBind(player, existing);
    }

}
