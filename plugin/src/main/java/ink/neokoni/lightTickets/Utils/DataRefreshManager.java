package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import org.bukkit.Bukkit;

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
    private static final Set<UUID> activePlayers = ConcurrentHashMap.newKeySet();
    private static final Map<UUID, Long> lastRefreshTime = new ConcurrentHashMap<>();

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
            refreshQueue.add(uuid);
        }
    }

    public static void onPlayerQuit(UUID uuid) {
        activePlayers.remove(uuid);
        refreshQueue.remove(uuid);
        lastRefreshTime.remove(uuid);
    }

    public static void requestRefresh(UUID uuid) {
        if (uuid == null || !activePlayers.contains(uuid)) return;
        lastRefreshTime.remove(uuid);
        refreshQueue.remove(uuid);
        refreshQueue.add(uuid);
    }

    public static void refreshNow(UUID uuid) {
        if (uuid == null || Bukkit.getPlayer(uuid) == null) return;
        doRefresh(uuid);
        lastRefreshTime.put(uuid, System.currentTimeMillis());
        if (activePlayers.contains(uuid)) {
            refreshQueue.remove(uuid);
            refreshQueue.add(uuid);
        }
    }

    public static void shutdown() {
        refreshQueue.clear();
        activePlayers.clear();
        lastRefreshTime.clear();
    }

    private static void processOne() {
        if (refreshQueue.isEmpty()) return;

        UUID uuid = refreshQueue.poll();
        if (uuid == null) return;

        if (Bukkit.getPlayer(uuid) == null) {
            activePlayers.remove(uuid);
            return;
        }

        long now = System.currentTimeMillis();
        Long last = lastRefreshTime.get(uuid);
        long intervalMs = Config.getConfig().getPlayerRefreshInterval() * 1000L;

        if (last != null && (now - last) < intervalMs) {
            refreshQueue.add(uuid);
            return;
        }

        doRefresh(uuid);
        lastRefreshTime.put(uuid, now);
        refreshQueue.add(uuid);
    }

    private static void doRefresh(UUID uuid) {
        try {
            refreshAccountInfo(uuid);
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
    }

    private static void refreshAccountInfo(UUID uuid) {
        HttpUtils.Resp resp = ApiClient.requestWithStatus(ApiEndpoint.MC_USER,
                Map.of("uuid", uuid.toString()));
        if (resp == null || resp.body() == null || resp.body().isEmpty()) return;

        boolean isBound = resp.status() == 200;
        String role = "player";
        if (isBound) {
            JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
            if (parsed != null && parsed.has("role") && !parsed.get("role").isJsonNull()) {
                role = parsed.get("role").getAsString();
            }
        }
        updateBindStatus(uuid, isBound, role);
    }

    private static void refreshTicketList(UUID uuid) {
        String resp = ApiClient.get(ApiEndpoint.MC_TICKET_LIST,
                Map.of("uuid", uuid.toString()),
                Map.of("page", "1", "pageSize", "10"));
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

    private static void updateBindStatus(UUID uuid, boolean bound, String role) {
        org.bukkit.entity.Player player = Bukkit.getPlayer(uuid);
        if (player == null) return;

        PlayerBind existing = PlayerData.getPlayerBind(player, true, true);
        existing.setBound(bound);
        existing.setRole(role == null || role.isEmpty() ? "player" : role);
        PlayerData.setPlayerBind(player, existing);
    }

}
