package ink.neokoni.lighttickets.gui;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.config.PluginConfig;
import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.network.ApiClient;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

import java.util.HashMap;
import java.util.Map;

public class CreateTicketMenu extends BaseMenu {
    private final ApiClient api;
    private final Player owner;
    private String selectedType = "bug_report";
    private String title = "";
    private final StringBuilder bodyBuilder = new StringBuilder();

    public CreateTicketMenu(LightTickets plugin, PluginConfig config, LangManager lang, ApiClient api, Player owner) {
        super(plugin, config, lang, "§6创建新议题", 4);
        this.api = api;
        this.owner = owner;
    }

    @Override
    protected Map<Integer, SlotAction> render(Player player) {
        Map<Integer, SlotAction> actions = new HashMap<>();

        for (int i = 0; i < rows * 9; i++) {
            actions.put(i, new SlotAction(placeholder()));
        }

        actions.put(11, typeButton(Material.BEACON, "§cBug报告", "bug_report"));
        actions.put(12, typeButton(Material.EMERALD, "§a权限申请", "permission_request"));
        actions.put(13, typeButton(Material.BOOK, "§b建议", "suggestion"));
        actions.put(14, typeButton(Material.BLAZE_POWDER, "§e举报", "report"));

        String displayTitle = title.isEmpty() ? "§7点击输入标题" : "§f" + title;
        actions.put(22, new SlotAction(
            createItem(Material.NAME_TAG, displayTitle),
            () -> {
                player.closeInventory();
                player.sendMessage(lang.prefix("cmd-create-enter-title"));
                registerTitleInput(player);
            }));

        actions.put(31, new SlotAction(
            createItem(Material.LIME_WOOL, "§a确认创建"),
            () -> {
                if (title.isEmpty()) {
                    player.sendMessage(lang.prefixRaw("§c请先输入标题"));
                    return;
                }
                player.closeInventory();
                api.createTicket(player.getUniqueId().toString(), title,
                        bodyBuilder.isEmpty() ? "Created via GUI" : bodyBuilder.toString(), selectedType)
                    .thenAccept(ticket -> plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                        player.sendMessage(lang.prefixFormat("cmd-create-success",
                            "{ticketId}", String.valueOf(ticket.getId()), "{title}", ticket.getTitle()))))
                    .exceptionally(ex -> {
                        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                            player.sendMessage(lang.prefix("error-api-failed")));
                        return null;
                    });
            }));

        actions.put(35, new SlotAction(
            createItem(Material.RED_WOOL, "§c取消"),
            () -> {
                player.closeInventory();
                player.sendMessage(lang.prefix("cmd-create-cancelled"));
            }));

        return actions;
    }

    private SlotAction typeButton(Material material, String name, String type) {
        boolean isSelected = selectedType.equals(type);
        String displayName = isSelected ? name + " ✓" : name;
        return new SlotAction(
            createItem(material, displayName),
            () -> { selectedType = type; refresh(owner); });
    }

    private void registerTitleInput(Player player) {
        org.bukkit.Bukkit.getPluginManager().registerEvents(new Listener() {
            @EventHandler
            public void onChat(AsyncPlayerChatEvent event) {
                if (!event.getPlayer().getUniqueId().equals(player.getUniqueId())) return;
                event.setCancelled(true);
                title = event.getMessage();
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t -> open(player));
                HandlerList.unregisterAll(this);
            }
        }, plugin);
    }
}
