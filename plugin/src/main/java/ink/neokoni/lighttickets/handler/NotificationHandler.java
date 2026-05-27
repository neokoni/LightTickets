package ink.neokoni.lighttickets.handler;

import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.model.Notification;
import ink.neokoni.lighttickets.storage.NotificationStore;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.UUID;

public class NotificationHandler {
    private final NotificationStore store;
    private final LangManager lang;

    public NotificationHandler(NotificationStore store, LangManager lang) {
        this.store = store;
        this.lang = lang;
    }

    public void handlePermissionApproved(String playerUuid, int ticketId, String groupName) {
        var message = lang.format("notify-permission-approved",
            "{ticketId}", String.valueOf(ticketId),
            "{groupName}", groupName != null ? groupName : "unknown");
        deliver(playerUuid, message);
    }

    public void handlePermissionRejected(String playerUuid, int ticketId, String reason) {
        var message = lang.format("notify-permission-rejected",
            "{ticketId}", String.valueOf(ticketId),
            "{reason}", reason != null ? reason : "无");
        deliver(playerUuid, message);
    }

    public void handleStatusChanged(String playerUuid, int ticketId, String newStatus) {
        String statusKey = switch (newStatus) {
            case "open" -> "status-open";
            case "in_progress" -> "status-in_progress";
            case "resolved" -> "status-resolved";
            case "closed" -> "status-closed";
            case "rejected" -> "status-rejected";
            default -> null;
        };
        String statusName = statusKey != null ? lang.getRaw(statusKey) : newStatus;
        var message = lang.format("notify-ticket-status",
            "{ticketId}", String.valueOf(ticketId),
            "{status}", statusName);
        deliver(playerUuid, message);
    }

    private void deliver(String playerUuid, net.kyori.adventure.text.Component message) {
        Player player = Bukkit.getPlayer(UUID.fromString(playerUuid));
        if (player != null && player.isOnline()) {
            player.sendMessage(lang.get("prefix").append(net.kyori.adventure.text.Component.space()).append(message));
        } else {
            store.insert(playerUuid, net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection().serialize(message));
        }
    }

    public void deliverOfflineNotifications(Player player) {
        String uuid = player.getUniqueId().toString();
        List<Notification> notifications = store.popAll(uuid);
        if (notifications.isEmpty()) return;

        player.sendMessage(lang.prefixFormat("notify-offline-summary", "{count}", String.valueOf(notifications.size())));
        for (Notification n : notifications) {
            player.sendMessage(lang.prefixRaw(n.getMessage()));
        }
    }
}
