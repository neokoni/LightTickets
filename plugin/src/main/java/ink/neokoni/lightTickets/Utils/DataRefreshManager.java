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
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;

public class DataRefreshManager {
    private static final Queue<UUID> refreshQueue = new ConcurrentLinkedQueue<>();
    private static final Map<UUID, RefreshState> refreshStates = new ConcurrentHashMap<>();

    private enum AccountRefreshResult {
        UPDATED,
        UNBOUND,
        RETRY
    }

    private static final class RefreshState {
        private boolean active;
        private boolean queued;
        private boolean inFlight;
        private long lastRefreshTime;
        private int retryAttempts;
        private long retryAfter;
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
        RefreshState state = stateFor(uuid);
        synchronized (state) {
            if (state.active) return;
            state.active = true;
            state.lastRefreshTime = 0L;
            state.retryAttempts = 0;
            state.retryAfter = 0L;
            enqueue(uuid, state);
        }
    }

    public static void onPlayerQuit(UUID uuid) {
        RefreshState state = refreshStates.get(uuid);
        if (state == null) return;
        synchronized (state) {
            state.active = false;
            state.queued = false;
            state.lastRefreshTime = 0L;
            state.retryAttempts = 0;
            state.retryAfter = 0L;
            refreshQueue.remove(uuid);
            if (!state.inFlight) {
                refreshStates.remove(uuid, state);
            }
        }
    }

    public static void requestRefresh(UUID uuid) {
        if (uuid == null) return;
        RefreshState state = refreshStates.get(uuid);
        if (state == null) return;
        synchronized (state) {
            if (!state.active) return;
            state.lastRefreshTime = 0L;
            state.retryAttempts = 0;
            state.retryAfter = 0L;
            enqueue(uuid, state);
        }
    }

    public static void refreshNow(UUID uuid) {
        if (uuid == null || Bukkit.getPlayer(uuid) == null) return;
        RefreshState state = stateFor(uuid);
        synchronized (state) {
            if (state.inFlight) return;
            state.inFlight = true;
        }
        try {
            AccountRefreshResult result = doRefresh(uuid);
            if (result != AccountRefreshResult.RETRY) {
                synchronized (state) {
                    state.lastRefreshTime = System.currentTimeMillis();
                    state.retryAttempts = 0;
                    state.retryAfter = 0L;
                }
            } else {
                scheduleRetry(state);
            }
        } finally {
            completeRefresh(uuid, state);
        }
    }

    public static void shutdown() {
        refreshQueue.clear();
        refreshStates.clear();
    }

    private static void processOne() {
        UUID uuid = refreshQueue.poll();
        if (uuid == null) return;
        RefreshState state = refreshStates.get(uuid);
        if (state == null) return;

        synchronized (state) {
            state.queued = false;
            if (!state.active || Bukkit.getPlayer(uuid) == null) {
                state.active = false;
                if (!state.inFlight) {
                    refreshStates.remove(uuid, state);
                }
                return;
            }
            if (state.inFlight) return;
            state.inFlight = true;
        }

        try {
            long now = System.currentTimeMillis();
            boolean blocked;
            boolean notDue;
            synchronized (state) {
                blocked = state.retryAfter != 0L && now < state.retryAfter;
                notDue = !blocked && state.lastRefreshTime != 0L
                        && (now - state.lastRefreshTime)
                        < Config.getConfig().getPlayerRefreshInterval() * 1_000L;
            }
            if (blocked || notDue) {
                return;
            }
            AccountRefreshResult result = doRefresh(uuid);
            if (result == AccountRefreshResult.RETRY) {
                scheduleRetry(state);
            } else {
                synchronized (state) {
                    state.lastRefreshTime = now;
                    state.retryAttempts = 0;
                    state.retryAfter = 0L;
                }
            }
        } finally {
            completeRefresh(uuid, state);
        }
    }

    private static RefreshState stateFor(UUID uuid) {
        return refreshStates.computeIfAbsent(uuid, key -> new RefreshState());
    }

    private static void enqueue(UUID uuid, RefreshState state) {
        if (refreshStates.get(uuid) == state && state.active && !state.queued) {
            state.queued = true;
            refreshQueue.add(uuid);
        }
    }

    private static void completeRefresh(UUID uuid, RefreshState state) {
        synchronized (state) {
            state.inFlight = false;
            if (refreshStates.get(uuid) == state && state.active) {
                enqueue(uuid, state);
            } else if (refreshStates.get(uuid) == state) {
                refreshStates.remove(uuid, state);
            }
        }
    }

    private static void scheduleRetry(RefreshState state) {
        synchronized (state) {
            int attempt = Math.min(state.retryAttempts + 1, 6);
            state.retryAttempts = attempt;
            long delay = Math.min(60_000L, 1_000L << attempt);
            state.retryAfter = System.currentTimeMillis() + delay;
        }
    }

    private static AccountRefreshResult doRefresh(UUID uuid) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null) return AccountRefreshResult.RETRY;

        // Unbound players never trigger HTTP calls or logs; their data is simply not refreshed.
        if (!hasUsableCredential(player)) return AccountRefreshResult.UNBOUND;

        AccountRefreshResult accountResult = AccountRefreshResult.RETRY;
        try {
            accountResult = refreshAccountInfo(uuid);
        } catch (Exception e) {
            if (!hasUsableCredential(player)) {
                // The binding was revoked during the request; treat as unbound silently.
                return AccountRefreshResult.UNBOUND;
            }
            LogUtils.warning("data_refresh.account_failed",
                    Map.of("{uuid}", uuid.toString(), "{message}", LogUtils.exceptionText(e)));
        }

        if (accountResult == AccountRefreshResult.UNBOUND) return accountResult;

        try {
            refreshTicketList(uuid);
        } catch (Exception e) {
            if (hasUsableCredential(player)) {
                LogUtils.warning("data_refresh.tickets_failed",
                        Map.of("{uuid}", uuid.toString(), "{message}", LogUtils.exceptionText(e)));
            }
        }
        return accountResult;
    }

    private static boolean hasUsableCredential(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        if (bind == null) return false;
        String credential = bind.getPlayerCredential();
        return credential != null && !credential.isBlank();
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
