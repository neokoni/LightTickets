package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.LightTickets;
import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.engineio.client.transports.WebSocket;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class WebSocketClient {
    private static Socket socket;

    public static synchronized void start() {
        shutdown();

        String serverKey = Config.getConfig().getServerKey();
        if (serverKey == null || serverKey.isBlank()) {
            logWarning("websocket.server_key_empty");
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        if (baseUrl.isBlank()) {
            logWarning("websocket.base_url_empty");
            return;
        }

        IO.Options options = IO.Options.builder()
                .setAuth(Map.of("serverKey", serverKey))
                .setQuery("serverKey=" + URLEncoder.encode(serverKey, StandardCharsets.UTF_8))
                .setExtraHeaders(Map.of("X-Server-Key", List.of(serverKey)))
                .setTransports(new String[]{WebSocket.NAME})
                .setReconnection(true)
                .setReconnectionDelay(5000)
                .setReconnectionDelayMax(30000)
                .setTimeout(10000)
                .build();

        try {
            socket = IO.socket(baseUrl + "/mc", options);
        } catch (URISyntaxException e) {
            logWarning("websocket.invalid_base_url", Map.of("{message}", exceptionText(e)));
            return;
        }

        socket.on(Socket.EVENT_CONNECT, args ->
                logInfo("websocket.connected"));
        socket.on(Socket.EVENT_DISCONNECT, args ->
                logInfo("websocket.disconnected"));
        socket.on(Socket.EVENT_CONNECT_ERROR, args ->
                logWarning("websocket.connect_failed", Map.of("{message}", firstArgText(args))));
        socket.on("ticket:status_changed", WebSocketClient::handleStatusChanged);
        socket.on("ticket:comment_created", WebSocketClient::handleCommentCreated);
        socket.on("hook:execute", WebSocketClient::handleHookExecute);
        try {
            socket.connect();
        } catch (Throwable e) {
            logWarning("websocket.connect_start_failed", Map.of("{message}", exceptionText(e)));
        }
    }

    public static synchronized void shutdown() {
        if (socket == null) return;
        try {
            socket.off();
            socket.disconnect();
            socket.close();
        } catch (Throwable e) {
            logWarning("websocket.shutdown_failed", Map.of("{message}", exceptionText(e)));
        }
        socket = null;
    }

    private static void handleStatusChanged(Object... args) {
        JSONObject data = firstObject(args);
        if (data == null) return;

        UUID playerUuid = parseUuid(data.optString("playerUuid", ""));
        if (playerUuid == null || isSameMinecraftUuid(playerUuid, data.optString("actorMinecraftUuid", ""))) return;

        String ticketId = String.valueOf(data.optInt("ticketId", 0));
        String title = data.optString("title", "");
        TicketStatus oldStatus = TicketStatus.fromKey(data.optString("oldStatus", ""));
        TicketStatus newStatus = TicketStatus.fromKey(data.optString("newStatus", ""));
        String actor = data.optString("actorName", LangUtils.getRawLang("notifications.unknown_actor"));

        sendToPlayer(playerUuid, statusNotification(ticketId, title, actor, oldStatus, newStatus));
    }

    private static void handleCommentCreated(Object... args) {
        JSONObject data = firstObject(args);
        if (data == null) return;

        UUID playerUuid = parseUuid(data.optString("playerUuid", ""));
        if (playerUuid == null || isSameMinecraftUuid(playerUuid, data.optString("authorMinecraftUuid", ""))) return;

        String ticketId = String.valueOf(data.optInt("ticketId", 0));
        String title = data.optString("title", "");
        String author = data.optString("authorName", LangUtils.getRawLang("notifications.unknown_actor"));
        String content = compactText(data.optString("body", ""));

        sendToPlayer(playerUuid, commentNotification(ticketId, title, author, content));
    }

    private static void handleHookExecute(Object... args) {
        JSONObject data = firstObject(args);
        if (data == null) return;

        UUID playerUuid = parseUuid(data.optString("playerUuid", ""));
        JSONArray hooks = data.optJSONArray("hooks");
        if (hooks == null) {
            hooks = legacyCommandHooks(data.optJSONArray("commands"));
        }
        if (hooks == null || hooks.length() == 0) return;
        final JSONArray executableHooks = hooks;

        Bukkit.getGlobalRegionScheduler().run(LightTickets.getInstance(), task -> {
            for (int i = 0; i < executableHooks.length(); i++) {
                JSONObject hook = executableHooks.optJSONObject(i);
                if (hook == null) continue;
                String error = executeHook(hook, playerUuid);
                if (hook.optBoolean("reportResult", false)) {
                    reportHookResult(hook, error == null, error);
                }
            }
        });
    }

    private static String executeHook(JSONObject hook, UUID playerUuid) {
        String type = hook.optString("type", "command");
        String content = hook.optString("content", "").trim();
        if (content.isEmpty()) return null;

        return switch (type) {
            case "command" -> executeCommandHook(content);
            case "minimessage" -> executeMiniMessageHook(playerUuid, content);
            default -> LangUtils.getRawLang("websocket.unknown_hook_type", Map.of("{type}", type));
        };
    }

    private static String executeCommandHook(String command) {
        try {
            boolean dispatched = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
            return dispatched ? null : LangUtils.getRawLang("websocket.command_returned_false",
                    Map.of("{command}", command));
        } catch (Throwable e) {
            String message = exceptionText(e);
            logWarning("websocket.hook_command_failed",
                    Map.of("{command}", command, "{message}", message));
            return message;
        }
    }

    private static String executeMiniMessageHook(UUID playerUuid, String message) {
        if (playerUuid == null) return LangUtils.getRawLang("websocket.missing_player_uuid");
        Player player = Bukkit.getPlayer(playerUuid);
        if (player == null) return LangUtils.getRawLang("websocket.player_not_online",
                Map.of("{uuid}", playerUuid.toString()));

        Component component = MiniMessage.miniMessage().deserialize(message);
        player.getScheduler().run(LightTickets.getInstance(),
                task -> player.sendMessage(component),
                null);
        return null;
    }

    private static JSONArray legacyCommandHooks(JSONArray commands) {
        if (commands == null) return null;
        JSONArray hooks = new JSONArray();
        for (int i = 0; i < commands.length(); i++) {
            String command = commands.optString(i, "").trim();
            if (command.isEmpty()) continue;
            hooks.put(new JSONObject(Map.of(
                    "hookId", "legacy:" + i + ":" + System.currentTimeMillis(),
                    "ticketId", 0,
                    "type", "command",
                    "content", command,
                    "reportResult", false)));
        }
        return hooks;
    }

    private static void reportHookResult(JSONObject hook, boolean success, String errorMessage) {
        String hookId = hook.optString("hookId", "");
        int ticketId = hook.optInt("ticketId", 0);
        if (hookId.isBlank() || ticketId <= 0) return;

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
            String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
            String url = baseUrl + "/api/mc/hook-results";

            com.google.gson.JsonObject body = new com.google.gson.JsonObject();
            body.addProperty("hookId", hookId);
            body.addProperty("ticketId", ticketId);
            body.addProperty("event", hook.optString("event", ""));
            body.addProperty("type", hook.optString("type", ""));
            body.addProperty("success", success);
            if (errorMessage != null && !errorMessage.isBlank()) {
                body.addProperty("errorMessage", errorMessage);
            }

            try {
                HttpUtils.post(url, JsonUtils.toJson(body), Map.of(
                        "Content-Type", "application/json",
                        "X-Server-Key", Config.getConfig().getServerKey()));
            } catch (RuntimeException e) {
                logWarning("websocket.hook_result_report_failed",
                        Map.of("{hookId}", hookId, "{message}", exceptionText(e)));
            }
        });
    }

    private static void sendToPlayer(UUID playerUuid, Component message) {
        Player player = Bukkit.getPlayer(playerUuid);
        if (player == null) return;

        player.getScheduler().run(LightTickets.getInstance(),
                task -> player.sendMessage(message),
                null);
    }

    private static Component baseNotification(String ticketId) {
        String hover = LangUtils.getRawLang("notifications.view_ticket_hover");
        return LangUtils.prefixComponent()
                .clickEvent(ClickEvent.runCommand("/lit ticket info " + ticketId))
                .hoverEvent(HoverEvent.showText(Component.text(hover)));
    }

    private static Component ticketHeader(String ticketId, String title) {
        return Component.text(LangUtils.getRawLang("notifications.ticket_prefix") + " ")
                .append(Component.text("#" + ticketId + " ", TicketStatus.CLOSED.textColor()))
                .append(Component.text(title + " "));
    }

    private static Component statusNotification(
            String ticketId,
            String title,
            String actor,
            TicketStatus oldStatus,
            TicketStatus newStatus) {
        String prefix = LangUtils.getRawLang("notifications.status_action_prefix",
                Map.of("{actor}", actor));
        String middle = LangUtils.getRawLang("notifications.status_action_middle");
        return baseNotification(ticketId)
                .append(ticketHeader(ticketId, title))
                .append(Component.text(prefix))
                .append(Component.text(oldStatus.label(), oldStatus.textColor()))
                .append(Component.text(middle))
                .append(Component.text(newStatus.label(), newStatus.textColor()));
    }

    private static Component commentNotification(String ticketId, String title, String author, String content) {
        String action = LangUtils.getRawLang("notifications.comment_action",
                Map.of("{author}", author, "{content}", content));
        return baseNotification(ticketId)
                .append(ticketHeader(ticketId, title))
                .append(Component.text(action));
    }

    private static JSONObject firstObject(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return null;
        if (args[0] instanceof JSONObject object) return object;
        try {
            return new JSONObject(args[0].toString());
        } catch (JSONException e) {
            logWarning("websocket.invalid_event_payload", Map.of("{message}", exceptionText(e)));
            return null;
        }
    }

    private static String firstArgText(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return "";
        if (args[0] instanceof Throwable throwable) {
            return exceptionText(throwable);
        }
        return compactLogValue(args[0].toString());
    }

    private static UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static boolean isSameMinecraftUuid(UUID playerUuid, String otherUuid) {
        UUID other = parseUuid(otherUuid);
        return other != null && playerUuid.equals(other);
    }

    private static String compactText(String value) {
        if (value == null) return "";
        return value.replace('\n', ' ').replace('\r', ' ').trim();
    }

    private static String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static void logInfo(String key) {
        LightTickets.getInstance().getLogger().info(LangUtils.getRawLang(key));
    }

    private static void logWarning(String key) {
        LightTickets.getInstance().getLogger().warning(LangUtils.getRawLang(key));
    }

    private static void logWarning(String key, Map<String, String> placeholders) {
        LightTickets.getInstance().getLogger().warning(LangUtils.getRawLang(key, placeholders));
    }

    private static String exceptionText(Throwable throwable) {
        if (throwable == null) return "";
        String message = throwable.getMessage();
        String text = throwable.getClass().getSimpleName() + (message == null || message.isBlank() ? "" : ": " + message);
        return compactLogValue(text);
    }

    private static String compactLogValue(String value) {
        if (value == null) return "";
        String compacted = value.replace('\n', ' ').replace('\r', ' ').trim();
        int maxLength = 240;
        return compacted.length() <= maxLength ? compacted : compacted.substring(0, maxLength);
    }
}
