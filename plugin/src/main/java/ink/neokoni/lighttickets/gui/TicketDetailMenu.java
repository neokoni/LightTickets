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
        actions.put(12, new SlotAction(createItem(Material.PAPER, "§7类型: §f" + ticket.getTypeName())));
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

        actions.put(35, new SlotAction(
            createItem(Material.ARROW, "§7返回主菜单"),
            () -> new MainMenu(plugin, config, lang, api).open(player)));

        return actions;
    }

    private void registerChatInput(Player player, String ticketId) {
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
}
