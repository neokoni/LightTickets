package ink.neokoni.lightTickets.Utils;

import java.net.URI;
import java.net.URISyntaxException;

final class LightTicketsUri {
    static final String SOCKET_TRANSPORT_PATH = "/socket.io";
    static final String SOCKET_NAMESPACE = "/mc";

    static String httpApiUrl(String baseUrl, String apiPath) {
        if (apiPath == null || !(apiPath.equals("/api") || apiPath.startsWith("/api/"))) {
            throw new IllegalArgumentException("API path must start with /api");
        }
        return origin(baseUrl).resolve(apiPath).toString();
    }

    static String socketNamespaceUrl(String baseUrl) {
        return origin(baseUrl).resolve(SOCKET_NAMESPACE).toString();
    }

    static URI origin(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("baseUrl is empty");
        }

        URI parsed;
        try {
            parsed = new URI(baseUrl.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("baseUrl is invalid", e);
        }

        if (!("http".equalsIgnoreCase(parsed.getScheme()) || "https".equalsIgnoreCase(parsed.getScheme()))
                || parsed.getHost() == null
                || parsed.getUserInfo() != null
                || parsed.getQuery() != null
                || parsed.getFragment() != null) {
            throw new IllegalArgumentException("baseUrl must be an http(s) origin");
        }

        String path = stripTrailingSlashes(parsed.getPath());
        // Previous releases generated baseUrl with /api. Read it for one upgrade
        // cycle while all newly generated configuration uses a pure origin.
        if (!(path.isEmpty() || "/api".equals(path))) {
            throw new IllegalArgumentException("baseUrl must not contain a path");
        }

        try {
            return new URI(parsed.getScheme().toLowerCase(), null, parsed.getHost(), parsed.getPort(), "/", null, null);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("baseUrl origin is invalid", e);
        }
    }

    private static String stripTrailingSlashes(String path) {
        if (path == null) return "";
        int end = path.length();
        while (end > 0 && path.charAt(end - 1) == '/') end--;
        return path.substring(0, end);
    }
}
