package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
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
        HttpUtils.Resp resp = HttpUtils.requestWithStatus(
                endpoint.method(),
                url(endpoint, pathParams, queryParams),
                body,
                headers(endpoint));
        if (resp == null || resp.body() == null || resp.body().isEmpty()) {
            return resp;
        }
        return new HttpUtils.Resp(resp.status(), unwrapEnvelope(resp.body()));
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
        Map<String, String> headers = new LinkedHashMap<>();
        if (endpoint.serverAuthenticated()) {
            headers.put("X-Server-Key", Config.getConfig().getServerKey());
        }
        return headers;
    }

    private static String url(ApiEndpoint endpoint, @Nullable Map<String, String> pathParams,
                              @Nullable Map<String, String> queryParams) {
        String path = endpoint.path();
        if (pathParams != null) {
            for (Map.Entry<String, String> entry : pathParams.entrySet()) {
                path = path.replace("{" + entry.getKey() + "}", encode(entry.getValue()));
            }
        }

        StringBuilder url = new StringBuilder(trimTrailingSlash(Config.getConfig().getBaseUrl()))
                .append(path);
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

    private static String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
