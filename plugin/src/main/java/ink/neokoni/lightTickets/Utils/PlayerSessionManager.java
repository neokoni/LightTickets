package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PlayerSessionManager {
    private static final long EXPIRY_MARGIN_MILLIS = 10_000L;
    private static final Map<UUID, PlayerSession> sessions = new ConcurrentHashMap<>();

    private PlayerSessionManager() {
    }

    public static synchronized String getSessionToken(Player player) {
        UUID uuid = player.getUniqueId();
        PlayerSession cached = sessions.get(uuid);
        if (cached != null && cached.expiresAtMillis() - EXPIRY_MARGIN_MILLIS > System.currentTimeMillis()) {
            return cached.token();
        }

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
        sessions.put(uuid, new PlayerSession(token, expiresAt));
        return token;
    }

    public static void invalidate(UUID uuid) {
        sessions.remove(uuid);
    }

    public static void clearAll() {
        sessions.clear();
    }

    public static void markBindingUnavailable(Player player) {
        invalidate(player.getUniqueId());
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        if (bind == null || !bind.isBound()) return;
        bind.setBound(false);
        bind.setRole("player");
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

    private record PlayerSession(String token, long expiresAtMillis) {
    }
}
