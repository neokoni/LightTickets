package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.engineio.client.transports.WebSocket;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class WebSocketClient {
    private static ConnectionState connectionState = ConnectionState.INITIAL;
    private static Socket socket;

    public static synchronized void start() {
        connectionState = ConnectionState.INITIAL;

        shutdown();

        String serverKey = Config.getConfig().getServerKey();
        if (serverKey == null || serverKey.isBlank()) {
            LogUtils.warning("websocket.server_key_empty");
            return;
        }

        String baseUrl = Config.getConfig().getBaseUrl();
        if (baseUrl == null || baseUrl.isBlank()) {
            LogUtils.warning("websocket.base_url_empty");
            return;
        }

        IO.Options options = IO.Options.builder()
                .setAuth(Map.of("serverKey", serverKey))
                .setTransports(new String[]{WebSocket.NAME})
                .setPath(LightTicketsUri.SOCKET_TRANSPORT_PATH)
                .setReconnection(true)
                .setReconnectionDelay(5000)
                .setReconnectionDelayMax(30000)
                .setTimeout(10000)
                .build();

        try {
            socket = IO.socket(LightTicketsUri.socketNamespaceUrl(baseUrl), options);
        } catch (URISyntaxException | IllegalArgumentException e) {
            LogUtils.warning("websocket.invalid_base_url", Map.of("{message}", LogUtils.exceptionText(e)));
            return;
        }
        socket.on(Socket.EVENT_CONNECT, args ->
                onStateChange(ConnectionState.CONNECTED,
                        () -> LogUtils.info("websocket.connected")));
        socket.on(Socket.EVENT_DISCONNECT, args ->
                onStateChange(ConnectionState.DISCONNECTED,
                        () -> LogUtils.info("websocket.disconnected")));
        socket.on(Socket.EVENT_CONNECT_ERROR, args ->
                onStateChange(ConnectionState.FAILED,
                        () -> LogUtils.warning("websocket.connect_failed",
                                Map.of("{message}", firstArgText(args)))));
        socket.on("ticket:status_changed", WebSocketClient::handleStatusChanged);
        socket.on("ticket:comment_created", WebSocketClient::handleCommentCreated);
        socket.on("hook:execute", WebSocketClient::handleHookExecute);
        try {
            socket.connect();
        } catch (Throwable e) {
            LogUtils.warning("websocket.connect_start_failed", Map.of("{message}", LogUtils.exceptionText(e)));
        }
    }

    private static synchronized void onStateChange(ConnectionState newState, Runnable onChanged) {
        if (connectionState == newState) return;
        connectionState = newState;
        onChanged.run();
    }

    private enum ConnectionState {
        INITIAL, CONNECTED, DISCONNECTED, FAILED
    }

    public static boolean isConnected() {
        Socket activeSocket = socket;
        return activeSocket != null && activeSocket.connected();
    }

    public static synchronized void shutdown() {
        if (socket == null) return;
        try {
            socket.off();
            socket.disconnect();
            socket.close();
        } catch (Throwable e) {
            LogUtils.warning("websocket.shutdown_failed", Map.of("{message}", LogUtils.exceptionText(e)));
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

        DataRefreshManager.requestRefresh(playerUuid);
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

        DataRefreshManager.requestRefresh(playerUuid);
        sendToPlayer(playerUuid, commentNotification(ticketId, title, author, content));
    }

    private static void handleHookExecute(Object... args) {
        JSONObject data = firstObject(args);
        if (data == null) return;

        String deliveryId = data.optString("deliveryId", "").trim();
        if (deliveryId.isEmpty()) return;
        UUID playerUuid = parseUuid(data.optString("playerUuid", ""));
        JSONArray hooks = data.optJSONArray("hooks");
        if (hooks == null || hooks.length() == 0) return;

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task ->
                claimAndScheduleHooks(deliveryId, playerUuid, hooks));
    }

    private static void claimAndScheduleHooks(String deliveryId, UUID playerUuid, JSONArray hooks) {
        List<ClaimedHook> claimedHooks = new ArrayList<>();
        List<JSONObject> results = new ArrayList<>();
        for (int i = 0; i < hooks.length(); i++) {
            JSONObject hook = hooks.optJSONObject(i);
            if (hook == null) continue;
            String hookId = hook.optString("hookId", "").trim();
            if (!hookId.startsWith(deliveryId + ":")) continue;
            try {
                if (PlayerData.claimHookExecution(hookId)) {
                    claimedHooks.add(new ClaimedHook(hookId, hook));
                }
            } catch (Throwable e) {
                results.add(hookResult(hookId, false, LogUtils.exceptionText(e)));
                LogUtils.warning("websocket.hook_execution_failed",
                        Map.of("{message}", LogUtils.exceptionText(e)));
            }
        }

        try {
            Bukkit.getGlobalRegionScheduler().run(LightTickets.getInstance(), task ->
                    executeClaimedHooks(deliveryId, playerUuid, claimedHooks, results));
        } catch (Throwable e) {
            LogUtils.warning("websocket.hook_execution_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
            emitAck(deliveryId, results);
        }
    }

    private static void executeClaimedHooks(
            String deliveryId,
            UUID playerUuid,
            List<ClaimedHook> claimedHooks,
            List<JSONObject> results) {
        for (ClaimedHook claimedHook : claimedHooks) {
            String failure = executeHook(claimedHook.hook(), playerUuid);
            if (failure != null) {
                LogUtils.warning("websocket.hook_execution_failed",
                        Map.of("{message}", failure));
            }
            results.add(hookResult(claimedHook.hookId(), failure == null, failure));
        }
        emitAck(deliveryId, results);
    }

    private static JSONObject hookResult(String hookId, boolean success, String error) {
        try {
            JSONObject result = new JSONObject();
            result.put("hookId", hookId);
            result.put("success", success);
            if (error != null) result.put("error", error);
            return result;
        } catch (JSONException e) {
            LogUtils.warning("websocket.hook_execution_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
            return new JSONObject();
        }
    }

    private static void emitAck(String deliveryId, List<JSONObject> results) {
        Socket activeSocket = socket;
        if (activeSocket == null || !activeSocket.connected()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("deliveryId", deliveryId);
            payload.put("results", new JSONArray(results));
            activeSocket.emit("hook:ack", payload);
        } catch (JSONException e) {
            LogUtils.warning("websocket.hook_execution_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
        }
    }

    private static String executeHook(JSONObject hook, UUID playerUuid) {
        String type = hook.optString("type", "");
        String content = hook.optString("content", "").trim();
        if (content.isEmpty()) return null;

        try {
            return switch (type) {
                case "command" -> executeCommandHook(content);
                case "minimessage" -> executeMiniMessageHook(playerUuid, content,
                        hook.optJSONObject("placeholders"));
                default -> LangUtils.getRawLang("websocket.unknown_hook_type", Map.of("{type}", type));
            };
        } catch (Throwable e) {
            return LogUtils.exceptionText(e);
        }
    }

    private static String executeCommandHook(String command) {
        try {
            boolean dispatched = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
            return dispatched ? null : LangUtils.getRawLang("websocket.command_returned_false",
                    Map.of("{command}", command));
        } catch (Throwable e) {
            String message = LogUtils.exceptionText(e);
            LogUtils.warning("websocket.hook_command_failed",
                    Map.of("{command}", command, "{message}", message));
            return message;
        }
    }

    private static String executeMiniMessageHook(UUID playerUuid, String message, JSONObject placeholders) {
        if (playerUuid == null) return LangUtils.getRawLang("websocket.missing_player_uuid");
        Player player = Bukkit.getPlayer(playerUuid);
        if (player == null) return LangUtils.getRawLang("websocket.player_not_online",
                Map.of("{uuid}", playerUuid.toString()));

        Component component;
        if (placeholders == null) {
            // Legacy deliveries already contain interpolated data and cannot be parsed safely.
            component = Component.text(message);
        } else {
            Map<String, String> values = new HashMap<>();
            Iterator<?> keys = placeholders.keys();
            while (keys.hasNext()) {
                String key = String.valueOf(keys.next());
                values.put('{' + key + '}', placeholders.optString(key, ""));
            }
            component = LangUtils.renderMiniMessage(message, values);
        }
        player.getScheduler().run(LightTickets.getInstance(),
                task -> player.sendMessage(component),
                null);
        return null;
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
            LogUtils.warning("websocket.invalid_event_payload", Map.of("{message}", LogUtils.exceptionText(e)));
            return null;
        }
    }

    private static String firstArgText(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return "";
        if (args[0] instanceof Throwable throwable) {
            return LogUtils.exceptionText(throwable);
        }
        return LogUtils.compact(args[0].toString());
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

    private record ClaimedHook(String hookId, JSONObject hook) {
    }

}
