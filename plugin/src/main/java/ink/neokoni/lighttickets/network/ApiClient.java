package ink.neokoni.lighttickets.network;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import ink.neokoni.lighttickets.model.Ticket;
import okhttp3.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class ApiClient {
    private final OkHttpClient http;
    private final String baseUrl;
    private final String serverKey;
    private final Gson gson = new Gson();

    public ApiClient(String baseUrl, String serverKey) {
        this.baseUrl = baseUrl;
        this.serverKey = serverKey;
        this.http = new OkHttpClient.Builder()
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build();
    }

    private Request.Builder request(String path) {
        return new Request.Builder()
            .url(baseUrl + path)
            .header("X-Server-Key", serverKey)
            .header("Content-Type", "application/json");
    }

    private CompletableFuture<String> executeAsync(Request request) {
        CompletableFuture<String> future = new CompletableFuture<>();
        http.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, java.io.IOException e) {
                future.completeExceptionally(e);
            }

            @Override
            public void onResponse(Call call, Response response) throws java.io.IOException {
                try (response) {
                    String body = response.body() != null ? response.body().string() : "";
                    if (!response.isSuccessful()) {
                        future.completeExceptionally(new ApiException(response.code(), body));
                    } else {
                        future.complete(body);
                    }
                }
            }
        });
        return future;
    }

    public CompletableFuture<List<Ticket>> getMyTickets(String playerUuid) {
        Request request = request("/api/mc/tickets/" + playerUuid).get().build();
        return executeAsync(request).thenApply(json -> {
            JsonArray arr = JsonParser.parseString(json).getAsJsonArray();
            List<Ticket> tickets = new ArrayList<>();
            for (var element : arr) {
                JsonObject obj = element.getAsJsonObject();
                tickets.add(new Ticket(
                    obj.get("id").getAsString(),
                    obj.get("title").getAsString(),
                    obj.has("body") ? obj.get("body").getAsString() : "",
                    obj.has("type") ? obj.get("type").getAsString() : "",
                    obj.has("status") ? obj.get("status").getAsString() : "",
                    obj.has("priority") ? obj.get("priority").getAsString() : "",
                    obj.has("createdAt") ? obj.get("createdAt").getAsString() : ""
                ));
            }
            return tickets;
        });
    }

    public CompletableFuture<Ticket> createTicket(String playerUuid, String title, String body, String type) {
        JsonObject payload = new JsonObject();
        payload.addProperty("minecraftUuid", playerUuid);
        payload.addProperty("title", title);
        payload.addProperty("body", body);
        payload.addProperty("type", type);

        Request request = request("/api/mc/tickets")
            .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
            .build();

        return executeAsync(request).thenApply(json -> {
            JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
            return new Ticket(
                obj.get("id").getAsString(),
                obj.get("title").getAsString(),
                obj.has("body") ? obj.get("body").getAsString() : "",
                obj.has("type") ? obj.get("type").getAsString() : "",
                obj.has("status") ? obj.get("status").getAsString() : "",
                obj.has("priority") ? obj.get("priority").getAsString() : "",
                obj.has("createdAt") ? obj.get("createdAt").getAsString() : ""
            );
        });
    }

    public CompletableFuture<Void> addComment(String playerUuid, String ticketId, String body) {
        JsonObject payload = new JsonObject();
        payload.addProperty("minecraftUuid", playerUuid);
        payload.addProperty("ticketId", ticketId);
        payload.addProperty("body", body);

        Request request = request("/api/mc/comments")
            .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
            .build();

        return executeAsync(request).thenApply(v -> null);
    }

    public CompletableFuture<String> generateLinkCode(String playerUuid, String playerName) {
        JsonObject payload = new JsonObject();
        payload.addProperty("minecraftUuid", playerUuid);
        payload.addProperty("minecraftName", playerName);

        Request request = request("/api/mc/link-code")
            .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
            .build();

        return executeAsync(request).thenApply(json -> {
            JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
            return obj.get("code").getAsString();
        });
    }

    public CompletableFuture<Void> reportPermissionExecution(String ticketId, boolean success, String errorMessage) {
        JsonObject payload = new JsonObject();
        payload.addProperty("ticketId", ticketId);
        payload.addProperty("success", success);
        if (errorMessage != null) {
            payload.addProperty("errorMessage", errorMessage);
        }

        Request request = request("/api/mc/permission-executed")
            .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
            .build();

        return executeAsync(request).thenApply(v -> null);
    }
}
