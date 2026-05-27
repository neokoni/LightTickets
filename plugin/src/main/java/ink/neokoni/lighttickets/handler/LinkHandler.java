package ink.neokoni.lighttickets.handler;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.network.ApiClient;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class LinkHandler {
    private final LightTickets plugin;
    private final ApiClient api;
    private final LangManager lang;
    private final Map<String, Boolean> pendingLinks = new ConcurrentHashMap<>();

    public LinkHandler(LightTickets plugin, ApiClient api, LangManager lang) {
        this.plugin = plugin;
        this.api = api;
        this.lang = lang;
    }

    public void startLink(Player player) {
        String uuid = player.getUniqueId().toString();
        pendingLinks.put(uuid, false);

        api.generateLinkCode(uuid, player.getName())
            .thenAccept(code -> {
                player.sendMessage(lang.prefixFormat("cmd-link-code", "{code}", code));
                player.sendMessage(lang.prefix("cmd-link-pending"));
                pollConfirmation(player, uuid);
            })
            .exceptionally(ex -> {
                player.sendMessage(lang.prefix("error-api-failed"));
                pendingLinks.remove(uuid);
                return null;
            });
    }

    private void pollConfirmation(Player player, String uuid) {
        AtomicInteger attempts = new AtomicInteger(0);
        int maxAttempts = 60;

        plugin.getServer().getAsyncScheduler().runAtFixedRate(plugin, task -> {
            if (!pendingLinks.containsKey(uuid)) {
                task.cancel();
                return;
            }
            if (!player.isOnline()) {
                pendingLinks.remove(uuid);
                task.cancel();
                return;
            }
            if (attempts.incrementAndGet() > maxAttempts) {
                pendingLinks.remove(uuid);
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefixRaw("绑定超时，请重新使用 /lt link")));
                task.cancel();
                return;
            }

            api.getMyTickets(uuid)
                .thenAccept(tickets -> {
                    if (pendingLinks.remove(uuid) != null) {
                        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                            player.sendMessage(lang.prefixFormat("cmd-link-success", "{name}", player.getName())));
                    }
                })
                .exceptionally(ex -> null);
        }, 0, 5, TimeUnit.SECONDS);
    }
}
