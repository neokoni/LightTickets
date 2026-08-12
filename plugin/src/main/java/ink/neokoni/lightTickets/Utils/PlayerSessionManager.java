package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

public final class PlayerSessionManager {
    private static final long EXPIRY_MARGIN_MILLIS = 10_000L;
    private static final Object sessionStateLock = new Object();
    private static final Map<UUID, SessionState> sessionStates = new HashMap<>();

    private PlayerSessionManager() {
    }

    public static String getSessionToken(Player player) {
        UUID uuid = player.getUniqueId();
        SessionState state;
        CompletableFuture<PlayerSession> refresh;
        boolean refreshOwner = false;
        synchronized (sessionStateLock) {
            state = sessionStates.computeIfAbsent(uuid, ignored -> new SessionState());
            PlayerSession cached = state.session;
            if (isUsable(cached)) {
                return cached.token();
            }
            if (state.refresh == null) {
                state.refresh = new CompletableFuture<>();
                refreshOwner = true;
            }
            refresh = state.refresh;
        }

        if (refreshOwner) {
            return refreshSession(player, uuid, state, refresh).token();
        }
        return awaitSession(refresh).token();
    }

    private static PlayerSession refreshSession(
            Player player,
            UUID uuid,
            SessionState state,
            CompletableFuture<PlayerSession> refresh) {
        try {
            PlayerSession session = requestSession(player, uuid);
            boolean accepted;
            synchronized (sessionStateLock) {
                accepted = sessionStates.get(uuid) == state && state.refresh == refresh;
                if (accepted) {
                    state.session = session;
                    state.refresh = null;
                }
            }
            if (accepted) {
                refresh.complete(session);
                return session;
            } else {
                RuntimeException error = sessionInvalidatedError();
                refresh.completeExceptionally(error);
                throw error;
            }
        } catch (Throwable error) {
            synchronized (sessionStateLock) {
                if (sessionStates.get(uuid) == state && state.refresh == refresh) {
                    state.refresh = null;
                }
            }
            refresh.completeExceptionally(error);
            if (error instanceof RuntimeException runtimeException) throw runtimeException;
            if (error instanceof Error fatalError) throw fatalError;
            throw new RuntimeException(error);
        }
    }

    private static PlayerSession requestSession(Player player, UUID uuid) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        String credential = bind == null ? null : bind.getPlayerCredential();
        if (credential == null || credential.isBlank()) {
            throw new RuntimeException(LangUtils.getRawLang("errors.rebind_required"));
        }

        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", uuid.toString());
        body.addProperty("playerCredential", credential);
        HttpUtils.Resp response = ApiClient.requestWithStatus(
                ApiEndpoint.MC_PLAYER_SESSION, JsonUtils.toJson(body));
        if (response == null || response.body() == null || response.body().isEmpty()) {
            throw new RuntimeException(LangUtils.getRawLang("errors.empty_response"));
        }
        if (response.status() != 201) {
            if (response.status() == 401 && bind.isBound()) {
                markBindingUnavailable(player);
            }
            JsonObject error = JsonUtils.fromJson(response.body(), JsonObject.class);
            throw new RuntimeException(response.status() == 401
                    ? LangUtils.getRawLang("errors.rebind_required")
                    : ApiClient.errorMessage(error));
        }

        JsonObject parsed = JsonUtils.fromJson(response.body(), JsonObject.class);
        if (parsed == null || !parsed.has("sessionToken") || !parsed.has("expiresAt")) {
            throw new RuntimeException(LangUtils.getRawLang("errors.invalid_response"));
        }
        String token = parsed.get("sessionToken").getAsString();
        long expiresAt = parseExpiry(parsed.get("expiresAt").getAsString());
        return new PlayerSession(token, expiresAt);
    }

    public static void invalidate(UUID uuid) {
        CompletableFuture<PlayerSession> refresh = null;
        synchronized (sessionStateLock) {
            SessionState state = sessionStates.remove(uuid);
            if (state != null) {
                state.session = null;
                refresh = state.refresh;
                state.refresh = null;
            }
        }
        if (refresh != null) {
            refresh.completeExceptionally(sessionInvalidatedError());
        }
    }

    public static void clearAll() {
        List<CompletableFuture<PlayerSession>> refreshes = new ArrayList<>();
        synchronized (sessionStateLock) {
            for (SessionState state : sessionStates.values()) {
                state.session = null;
                if (state.refresh != null) {
                    refreshes.add(state.refresh);
                    state.refresh = null;
                }
            }
            sessionStates.clear();
        }
        RuntimeException error = sessionInvalidatedError();
        for (CompletableFuture<PlayerSession> refresh : refreshes) {
            refresh.completeExceptionally(error);
        }
    }

    public static void markBindingUnavailable(Player player) {
        invalidate(player.getUniqueId());
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        if (bind == null || !bind.isBound()) return;
        bind.setBound(false);
        bind.setRole(AccountRole.PLAYER);
        bind.setPlayerCredential(null);
        PlayerData.setPlayerBind(player, bind);
    }

    private static long parseExpiry(String value) {
        try {
            return Instant.parse(value).toEpochMilli();
        } catch (DateTimeParseException e) {
            throw new RuntimeException(LangUtils.getRawLang("errors.invalid_response"), e);
        }
    }

    private static boolean isUsable(PlayerSession session) {
        return session != null
                && session.expiresAtMillis() - EXPIRY_MARGIN_MILLIS > System.currentTimeMillis();
    }

    private static PlayerSession awaitSession(CompletableFuture<PlayerSession> refresh) {
        try {
            return refresh.join();
        } catch (CompletionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof RuntimeException runtimeException) throw runtimeException;
            if (cause instanceof Error fatalError) throw fatalError;
            throw new RuntimeException(cause);
        }
    }

    private static RuntimeException sessionInvalidatedError() {
        return new RuntimeException(LangUtils.getRawLang("errors.session_invalidated"));
    }

    private static final class SessionState {
        private PlayerSession session;
        private CompletableFuture<PlayerSession> refresh;
    }

    private record PlayerSession(String token, long expiresAtMillis) {
    }
}
