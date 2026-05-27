package ink.neokoni.lighttickets.network;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.config.PluginConfig;
import ink.neokoni.lighttickets.handler.NotificationHandler;
import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;
import org.json.JSONObject;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class WebSocketClient {
    private final LightTickets plugin;
    private final PluginConfig config;
    private final NotificationHandler notificationHandler;
    private Socket socket;
    private final AtomicInteger retryCount = new AtomicInteger(0);
    private boolean disabled = false;

    public WebSocketClient(LightTickets plugin, PluginConfig config, NotificationHandler notificationHandler) {
        this.plugin = plugin;
        this.config = config;
        this.notificationHandler = notificationHandler;
    }

    public void connect() {
        if (disabled) return;

        try {
            URI serverUri = URI.create(config.getServerUrl());
            IO.Options options = IO.Options.builder()
                .setAuth(Map.of("serverKey", config.getServerKey()))
                .build();

            socket = IO.socket(serverUri.resolve("/mc"), options);
            registerListeners();
            socket.connect();
        } catch (Exception e) {
            scheduleReconnect();
        }
    }

    private void registerListeners() {
        socket.on(Socket.EVENT_CONNECT, args -> retryCount.set(0));

        socket.on(Socket.EVENT_DISCONNECT, args -> scheduleReconnect());

        socket.on(Socket.EVENT_CONNECT_ERROR, args -> scheduleReconnect());

        socket.on("permission:approved", args -> {
            try {
                JSONObject data = (JSONObject) args[0];
                int ticketId = data.getInt("ticketId");
                String playerUuid = data.getString("playerUuid");
                String groupName = data.optString("groupName", null);
                plugin.getServer().getGlobalRegionScheduler().run(plugin,
                    t -> notificationHandler.handlePermissionApproved(playerUuid, ticketId, groupName));
            } catch (Exception ignored) {}
        });

        socket.on("permission:rejected", args -> {
            try {
                JSONObject data = (JSONObject) args[0];
                int ticketId = data.getInt("ticketId");
                String playerUuid = data.getString("playerUuid");
                String reason = data.optString("reason", null);
                plugin.getServer().getGlobalRegionScheduler().run(plugin,
                    t -> notificationHandler.handlePermissionRejected(playerUuid, ticketId, reason));
            } catch (Exception ignored) {}
        });

        socket.on("ticket:status_changed", args -> {
            try {
                JSONObject data = (JSONObject) args[0];
                int ticketId = data.getInt("ticketId");
                String playerUuid = data.getString("playerUuid");
                String newStatus = data.getString("newStatus");
                plugin.getServer().getGlobalRegionScheduler().run(plugin,
                    t -> notificationHandler.handleStatusChanged(playerUuid, ticketId, newStatus));
            } catch (Exception ignored) {}
        });
    }

    private void scheduleReconnect() {
        if (disabled) return;

        int retries = retryCount.incrementAndGet();
        if (retries > config.getMaxRetries()) {
            disabled = true;
            return;
        }

        long delaySeconds = config.getRetryInterval() * 60L;
        plugin.getServer().getGlobalRegionScheduler().runDelayed(plugin, t -> {
            if (socket != null) {
                socket.disconnect();
                socket.off();
            }
            connect();
        }, delaySeconds * 20L);
    }

    public void disconnect() {
        disabled = true;
        if (socket != null) {
            socket.disconnect();
            socket.off();
        }
    }
}
