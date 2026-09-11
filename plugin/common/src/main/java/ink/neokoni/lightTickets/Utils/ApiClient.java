package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.platform.LightPlayer;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import ink.neokoni.lightTickets.platform.PlatformType;
import org.jetbrains.annotations.Nullable;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

public class ApiClient {
    private ApiClient() {
    }

    public static String get(ApiEndpoint endpoint) {
        HttpUtils.Resp resp = requestWithStatus(endpoint, null, null, null);
        return resp == null ? null : resp.body();
    }

    public static String get(ApiEndpoint endpoint, Map<String, String> pathParams) {
        HttpUtils.Resp resp = requestWithStatus(endpoint, pathParams, null, null);
        return resp == null ? null : resp.body();
    }

    public static String get(ApiEndpoint endpoint, Map<String, String> pathParams,
                             Map<String, String> queryParams) {
        HttpUtils.Resp resp = requestWithStatus(endpoint, pathParams, queryParams, null);
        return resp == null ? null : resp.body();
    }

    public static String post(ApiEndpoint endpoint, String body) {
        HttpUtils.Resp resp = requestWithStatus(endpoint, null, null, body);
        return resp == null ? null : resp.body();
    }

    public static String getForPlayer(LightPlayer player, ApiEndpoint endpoint,
                                      @Nullable Map<String, String> pathParams,
                                      @Nullable Map<String, String> queryParams) {
        HttpUtils.Resp resp = requestWithStatusForPlayer(player, endpoint, pathParams, queryParams, null);
        return resp == null ? null : resp.body();
    }

    public static String postForPlayer(LightPlayer player, ApiEndpoint endpoint, String body) {
        HttpUtils.Resp resp = requestWithStatusForPlayer(player, endpoint, null, null, body);
        return resp == null ? null : resp.body();
    }

    /**
     * Fetches a Minecraft viewer endpoint for a player. Mirrors the web conditional auth:
     * players with a usable binding credential are sent with their session (role-aware
     * visibility); unbound players degrade to an anonymous server-key request. If the
     * platform requires login the anonymous request receives 401.
     */
    public static HttpUtils.Resp requestForMcViewer(LightPlayer player, ApiEndpoint endpoint,
                                                    @Nullable Map<String, String> pathParams,
                                                    @Nullable Map<String, String> queryParams) {
        if (!PlayerData.hasPlayerCredential(player)) {
            return requestWithStatus(player, endpoint, pathParams, queryParams, null);
        }
        try {
            return requestWithStatusForPlayer(player, endpoint, pathParams, queryParams, null, false);
        } catch (RuntimeException e) {
            if (!PlayerData.hasPlayerCredential(player)) {
                // Binding was revoked during the request; fall back to the anonymous view.
                return requestWithStatus(player, endpoint, pathParams, queryParams, null);
            }
            throw e;
        }
    }

    public static HttpUtils.Resp requestWithStatus(ApiEndpoint endpoint) {
        return requestWithStatus(endpoint, null, null, null);
    }

    public static HttpUtils.Resp requestWithStatus(ApiEndpoint endpoint,
                                                   @Nullable Map<String, String> pathParams) {
        return requestWithStatus(endpoint, pathParams, null, null);
    }

    public static HttpUtils.Resp requestWithStatus(ApiEndpoint endpoint, String body) {
        return requestWithStatus(endpoint, null, null, body);
    }

    public static HttpUtils.Resp requestWithStatus(ApiEndpoint endpoint,
                                                   @Nullable Map<String, String> pathParams,
                                                   @Nullable Map<String, String> queryParams,
                                                   @Nullable String body) {
        return requestWithStatus(null, endpoint, pathParams, queryParams, body);
    }

    public static HttpUtils.Resp requestWithStatus(LightPlayer player, ApiEndpoint endpoint, String body) {
        return requestWithStatus(player, endpoint, null, null, body);
    }

    public static HttpUtils.Resp requestWithStatus(LightPlayer player, ApiEndpoint endpoint,
                                                   @Nullable Map<String, String> pathParams,
                                                   @Nullable Map<String, String> queryParams,
                                                   @Nullable String body) {
        return unwrap(send(endpoint, player, pathParams, queryParams, body, null));
    }

    public static HttpUtils.Resp requestWithStatusForPlayer(LightPlayer player, ApiEndpoint endpoint,
                                                             @Nullable Map<String, String> pathParams,
                                                             @Nullable Map<String, String> queryParams,
                                                             @Nullable String body) {
        return requestWithStatusForPlayer(player, endpoint, pathParams, queryParams, body, true);
    }

    public static HttpUtils.Resp requestWithStatusForPlayer(LightPlayer player, ApiEndpoint endpoint,
                                                             @Nullable Map<String, String> pathParams,
                                                             @Nullable Map<String, String> queryParams,
                                                             @Nullable String body,
                                                             boolean markBindingUnavailable) {
        String sessionToken = PlayerSessionManager.getSessionToken(player);
        HttpUtils.Resp resp = send(endpoint, player, pathParams, queryParams, body, sessionToken);
        if (resp != null && resp.status() == 401) {
            PlayerSessionManager.invalidate(player.getUniqueId());
            sessionToken = PlayerSessionManager.getSessionToken(player);
            resp = send(endpoint, player, pathParams, queryParams, body, sessionToken);
            if (markBindingUnavailable && resp != null && resp.status() == 401) {
                PlayerSessionManager.markBindingUnavailable(player);
            }
        }
        return unwrap(resp);
    }

    public static String errorMessage(JsonObject parsed) {
        if (parsed == null) {
            return LangUtils.getRawLang("errors.invalid_response");
        }
        if (parsed.has("error") && !parsed.get("error").isJsonNull()) {
            return parsed.get("error").getAsString();
        }
        if (parsed.has("message") && !parsed.get("message").isJsonNull()) {
            return parsed.get("message").getAsString();
        }
        return LangUtils.getRawLang("errors.invalid_response");
    }

    private static Map<String, String> headers(ApiEndpoint endpoint) {
        return headers(endpoint, null);
    }

    private static Map<String, String> headers(ApiEndpoint endpoint, @Nullable String playerSession) {
        Map<String, String> headers = new LinkedHashMap<>();
        if (endpoint.serverAuthenticated()) {
            headers.put("X-Server-Key", Config.getConfig().getServerKey());
        }
        if (playerSession != null && !playerSession.isEmpty()) {
            headers.put("X-Player-Session", playerSession);
        }
        return headers;
    }

    private static HttpUtils.Resp send(ApiEndpoint endpoint,
                                       @Nullable LightPlayer player,
                                       @Nullable Map<String, String> pathParams,
                                       @Nullable Map<String, String> queryParams,
                                       @Nullable String body,
                                       @Nullable String playerSession) {
        Prepared prepared = prepare(endpoint, player, pathParams, queryParams, body);
        return HttpUtils.requestWithStatus(
                prepared.endpoint().method(),
                url(prepared.endpoint(), pathParams, prepared.queryParams()),
                prepared.body(),
                headers(prepared.endpoint(), playerSession));
    }

    private static Prepared prepare(ApiEndpoint endpoint,
                                    @Nullable LightPlayer player,
                                    @Nullable Map<String, String> pathParams,
                                    @Nullable Map<String, String> queryParams,
                                    @Nullable String body) {
        if (!endpoint.serverAuthenticated()
                || LightPlatformProvider.get().getType() != PlatformType.VELOCITY) {
            return new Prepared(endpoint, queryParams, body);
        }

        String serverId = player == null ? null : player.getServerId();
        if (serverId == null || serverId.isBlank()) {
            throw new RuntimeException(LangUtils.getRawLang("errors.server_id_unavailable"));
        }

        ApiEndpoint bodyVariant = endpoint.bodyVariant();
        if (bodyVariant == null) {
            return new Prepared(endpoint, queryParams,
                    body == null || body.isBlank() ? body : withServerId(body, serverId));
        }

        JsonObject payload = body == null || body.isBlank()
                ? new JsonObject()
                : JsonUtils.fromJson(body, JsonObject.class);
        if (payload == null) {
            payload = new JsonObject();
        }
        if (queryParams != null) {
            for (Map.Entry<String, String> entry : queryParams.entrySet()) {
                if (entry.getValue() != null) {
                    payload.addProperty(entry.getKey(), entry.getValue());
                }
            }
        }
        if (pathParams != null) {
            for (Map.Entry<String, String> entry : pathParams.entrySet()) {
                if (entry.getValue() != null
                        && !bodyVariant.path().contains("{" + entry.getKey() + "}")) {
                    payload.addProperty(entry.getKey(), entry.getValue());
                }
            }
        }
        return new Prepared(bodyVariant, null, withServerId(payload.toString(), serverId));
    }

    private static String withServerId(String body, String serverId) {
        JsonObject payload = body == null || body.isBlank()
                ? new JsonObject()
                : JsonUtils.fromJson(body, JsonObject.class);
        if (payload == null) {
            payload = new JsonObject();
        }
        payload.addProperty("serverId", serverId);
        return payload.toString();
    }

    private record Prepared(ApiEndpoint endpoint, @Nullable Map<String, String> queryParams,
                            @Nullable String body) {
    }

    private static HttpUtils.Resp unwrap(HttpUtils.Resp resp) {
        if (resp == null || resp.body() == null || resp.body().isEmpty()) {
            return resp;
        }
        return new HttpUtils.Resp(resp.status(), unwrapEnvelope(resp.body()));
    }

    private static String url(ApiEndpoint endpoint, @Nullable Map<String, String> pathParams,
                              @Nullable Map<String, String> queryParams) {
        String path = endpoint.path();
        if (pathParams != null) {
            for (Map.Entry<String, String> entry : pathParams.entrySet()) {
                path = path.replace("{" + entry.getKey() + "}", encode(entry.getValue()));
            }
        }

        StringBuilder url = new StringBuilder(
                LightTicketsUri.httpApiUrl(Config.getConfig().getBaseUrl(), path));
        if (queryParams != null && !queryParams.isEmpty()) {
            boolean first = true;
            for (Map.Entry<String, String> entry : queryParams.entrySet()) {
                if (entry.getValue() == null) continue;
                url.append(first ? '?' : '&')
                        .append(encode(entry.getKey()))
                        .append('=')
                        .append(encode(entry.getValue()));
                first = false;
            }
        }
        return url.toString();
    }

    private static String unwrapEnvelope(String body) {
        try {
            JsonElement parsed = JsonUtils.fromJson(body, JsonElement.class);
            if (parsed == null || !parsed.isJsonObject()) {
                return body;
            }
            JsonObject object = parsed.getAsJsonObject();
            if (!object.has("success") || !object.get("success").getAsBoolean() || !object.has("data")) {
                return body;
            }
            JsonElement data = object.get("data");
            if (data == null || data.isJsonNull()) {
                return "";
            }
            return data.toString();
        } catch (Exception ignored) {
            return body;
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8)
                .replace("+", "%20");
    }

}
