package ink.neokoni.lightTickets.Utils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpRequest.BodyPublishers;
import java.time.Duration;
import java.util.Map;

import org.jetbrains.annotations.Nullable;

public class HttpUtils {
    private static HttpClient httpClient;

    public record Resp(int status, String body) {}

    public static String get(String url, @Nullable Map<String, String> headers) {
        Resp r = getWithStatus(url, headers);
        return r == null ? null : r.body();
    }

    public static String post(String url, String body, @Nullable Map<String, String> headers) {
        Resp r = postWithStatus(url, body, headers);
        return r == null ? null : r.body();
    }

    public static Resp getWithStatus(String url, @Nullable Map<String, String> headers) {
        initHttpClient();
        try {
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .GET();
            applyHeaders(requestBuilder, headers);
            return send("GET", url, requestBuilder.build());
        } catch (IllegalArgumentException e) {
            throw requestException("http.invalid_uri",
                    Map.of("{url}", url, "{message}", exceptionText(e)), e);
        }
    }

    public static Resp postWithStatus(String url, String body, @Nullable Map<String, String> headers) {
        initHttpClient();
        try {
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .POST(BodyPublishers.ofString(body))
                    .header("Content-Type", "application/json");
            applyHeaders(requestBuilder, headers);
            return send("POST", url, requestBuilder.build());
        } catch (IllegalArgumentException e) {
            throw requestException("http.invalid_uri",
                    Map.of("{url}", url, "{message}", exceptionText(e)), e);
        }
    }

    private static Resp send(String method, String url, HttpRequest request) {
        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw requestException("http.interrupted",
                    Map.of("{method}", method, "{url}", url), e);
        } catch (Exception e) {
            throw requestException("http.request_failed",
                    Map.of("{method}", method, "{url}", url, "{message}", exceptionText(e)), e);
        }
        if (response != null) {
            return new Resp(response.statusCode(), response.body());
        }
        return null;
    }

    private static void applyHeaders(HttpRequest.Builder requestBuilder, @Nullable Map<String, String> headers) {
        if (headers != null) {
            headers.forEach(requestBuilder::header);
        }
    }

    private static void initHttpClient() {
        if (httpClient == null) {
            httpClient = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .connectTimeout(Duration.ofSeconds(30))
                    .version(HttpClient.Version.HTTP_1_1)
                    .build();
        }
    }

    private static RuntimeException requestException(String langKey, Map<String, String> placeholders, Throwable cause) {
        return new RuntimeException(LangUtils.getRawLang(langKey, placeholders), cause);
    }

    private static String exceptionText(Throwable throwable) {
        if (throwable == null) return "";
        String message = throwable.getMessage();
        String text = throwable.getClass().getSimpleName() + (message == null || message.isBlank() ? "" : ": " + message);
        return compact(text);
    }

    private static String compact(String value) {
        if (value == null) return "";
        String compacted = value.replace('\n', ' ').replace('\r', ' ').trim();
        int maxLength = 240;
        return compacted.length() <= maxLength ? compacted : compacted.substring(0, maxLength);
    }
}
