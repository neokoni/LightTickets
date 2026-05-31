package ink.neokoni.lighttickets.gui;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.config.PluginConfig;
import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.model.Ticket;
import ink.neokoni.lighttickets.network.ApiClient;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.plugin.PluginManager;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class TicketDetailMenu extends BaseMenu {
    private final ApiClient api;
    private final Ticket ticket;

    public TicketDetailMenu(LightTickets plugin, PluginConfig config, LangManager lang, ApiClient api, Ticket ticket) {
        super(plugin, config, lang, "§6#" + ticket.getId() + " " + ticket.getTitle(), 4);
        this.api = api;
        this.ticket = ticket;
    }

    @Override
    protected Map<Integer, SlotAction> render(Player player) {
        Map<Integer, SlotAction> actions = new HashMap<>();

        for (int i = 0; i < rows * 9; i++) {
            actions.put(i, new SlotAction(placeholder()));
        }

        actions.put(10, new SlotAction(createItem(Material.NAME_TAG, "§f" + ticket.getTitle())));
        actions.put(11, new SlotAction(createItem(Material.BOOK, "§7状态: §f" + ticket.getStatusName())));
        actions.put(12, new SlotAction(createItem(Material.PAPER, "§7模板: §f" + ticket.getTemplate())));
        actions.put(13, new SlotAction(createItem(Material.REDSTONE, "§7优先级: §f" + ticket.getPriority())));

        String[] bodyLines = ticket.getBody().split("\n");
        int bodySlot = 19;
        for (String line : bodyLines) {
            if (bodySlot >= 27) break;
            actions.put(bodySlot, new SlotAction(
                createItem(Material.PAPER, "§7" + line.substring(0, Math.min(line.length(), 50)))));
            bodySlot++;
        }

        actions.put(31, new SlotAction(
            createItem(Material.FEATHER, "§a添加评论"),
            () -> {
                player.closeInventory();
                player.sendMessage(lang.prefixRaw("§e请在聊天框输入评论内容："));
                registerChatInput(player, ticket.getId());
            }));

        // Close ticket (slot 33)
        boolean canClose = ticket.getStatus().equals("open") || ticket.getStatus().equals("in_progress");
        if (canClose) {
            actions.put(33, new SlotAction(
                createItem(Material.LIME_DYE, "§a关闭议题"),
                () -> {
                    player.closeInventory();
                    player.sendMessage(lang.prefixRaw("§e确认关闭议题 #" + ticket.getId() + "？在聊天框输入 y 确认"));
                    registerConfirmInput(player, ticket.getId(), "close", api);
                }));
        }

        // Reopen ticket (slot 33, same slot since mutually exclusive)
        boolean canReopen = ticket.getStatus().equals("resolved") || ticket.getStatus().equals("closed");
        if (canReopen) {
            actions.put(33, new SlotAction(
                createItem(Material.ORANGE_DYE, "§e重新打开"),
                () -> {
                    player.closeInventory();
                    player.sendMessage(lang.prefixRaw("§e确认重新打开议题 #" + ticket.getId() + "？在聊天框输入 y 确认"));
                    registerConfirmInput(player, ticket.getId(), "reopen", api);
                }));
        }

        actions.put(35, new SlotAction(
            createItem(Material.ARROW, "§7返回主菜单"),
            () -> new MainMenu(plugin, config, lang, api).open(player)));

        return actions;
    }

    private void registerChatInput(Player player, int ticketId) {
        PluginManager pm = org.bukkit.Bukkit.getPluginManager();

        pm.registerEvents(new Listener() {
            @EventHandler
            public void onChat(AsyncPlayerChatEvent event) {
                if (!event.getPlayer().getUniqueId().equals(player.getUniqueId())) return;
                event.setCancelled(true);
                String body = event.getMessage();

                api.addComment(player.getUniqueId().toString(), ticketId, body)
                    .thenRun(() -> plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                        player.sendMessage(lang.prefix("cmd-comment-success"))))
                    .exceptionally(ex -> {
                        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                            player.sendMessage(lang.prefix("error-api-failed")));
                        return null;
                    });

                HandlerList.unregisterAll(this);
            }
        }, plugin);
    }

    private void registerConfirmInput(Player player, int ticketId, String action, ApiClient api) {
        PluginManager pm = org.bukkit.Bukkit.getPluginManager();

        pm.registerEvents(new Listener() {
            @EventHandler
            public void onChat(AsyncPlayerChatEvent event) {
                if (!event.getPlayer().getUniqueId().equals(player.getUniqueId())) return;
                event.setCancelled(true);

                String message = event.getMessage().trim();
                if (!message.equalsIgnoreCase("y") && !message.equalsIgnoreCase("yes")) {
                    player.sendMessage(lang.prefixRaw("§c操作已取消"));
                    HandlerList.unregisterAll(this);
                    return;
                }

                CompletableFuture<Void> future = action.equals("close")
                    ? api.closeTicket(player.getUniqueId().toString(), ticketId)
                    : api.reopenTicket(player.getUniqueId().toString(), ticketId);

                future.thenRun(() -> plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                        player.sendMessage(lang.prefix(action.equals("close") ? "cmd-close-success" : "cmd-reopen-success"))))
                    .exceptionally(ex -> {
                        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                            player.sendMessage(lang.prefix("error-api-failed")));
                        return null;
                    });

                HandlerList.unregisterAll(this);
            }
        }, plugin);
    }
}
