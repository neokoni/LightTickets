package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

public class WebSocketClient {
    private static Socket socket;

    public static synchronized void start() {
        shutdown();

        String serverKey = Config.getConfig().getServerKey();
        if (serverKey == null || serverKey.isBlank()) {
            LightTickets.getInstance().getLogger().warning("[websocket] server key is empty, websocket disabled");
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        if (baseUrl.isBlank()) {
            LightTickets.getInstance().getLogger().warning("[websocket] base url is empty, websocket disabled");
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
            LightTickets.getInstance().getLogger().log(Level.WARNING, "[websocket] invalid base url", e);
            return;
        }

        socket.on(Socket.EVENT_CONNECT, args ->
                LightTickets.getInstance().getLogger().info("[websocket] connected"));
        socket.on(Socket.EVENT_DISCONNECT, args ->
                LightTickets.getInstance().getLogger().info("[websocket] disconnected"));
        socket.on(Socket.EVENT_CONNECT_ERROR, args ->
                LightTickets.getInstance().getLogger().warning("[websocket] connect failed: " + firstArgText(args)));
        socket.on("ticket:status_changed", WebSocketClient::handleStatusChanged);
        socket.on("ticket:comment_created", WebSocketClient::handleCommentCreated);
        socket.on("hook:execute", WebSocketClient::handleHookExecute);
        socket.connect();
    }

    public static synchronized void shutdown() {
        if (socket == null) return;
        socket.off();
        socket.disconnect();
        socket.close();
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
        if (data == null || !data.has("commands")) return;

        JSONArray commands = data.optJSONArray("commands");
        if (commands == null || commands.length() == 0) return;

        Bukkit.getGlobalRegionScheduler().run(LightTickets.getInstance(), task -> {
            for (int i = 0; i < commands.length(); i++) {
                String command = commands.optString(i, "").trim();
                if (!command.isEmpty()) {
                    Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
                }
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
            LightTickets.getInstance().getLogger().log(Level.WARNING, "[websocket] invalid event payload", e);
            return null;
        }
    }

    private static String firstArgText(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return "";
        return args[0].toString();
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
}
