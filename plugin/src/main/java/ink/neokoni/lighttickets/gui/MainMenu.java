package ink.neokoni.lighttickets.gui;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.config.PluginConfig;
import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.model.Ticket;
import ink.neokoni.lighttickets.network.ApiClient;
import org.bukkit.Material;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainMenu extends BaseMenu {
    private final ApiClient api;
    private List<Ticket> tickets = List.of();

    public MainMenu(LightTickets plugin, PluginConfig config, LangManager lang, ApiClient api) {
        super(plugin, config, lang, "§6Light Tickets", 6);
        this.api = api;
    }

    @Override
    protected Map<Integer, SlotAction> render(Player player) {
        Map<Integer, SlotAction> actions = new HashMap<>();
        String uuid = player.getUniqueId().toString();

        for (int i = 0; i < rows * 9; i++) {
            actions.put(i, new SlotAction(placeholder()));
        }

        api.getMyTickets(uuid).thenAccept(ticketList -> {
            this.tickets = ticketList;
            plugin.getServer().getGlobalRegionScheduler().run(plugin, t -> refresh(player));
        }).exceptionally(ex -> {
            this.tickets = List.of();
            return null;
        });

        int pageSize = getPageSize();
        int start = getPageStart();
        int end = Math.min(start + pageSize, tickets.size());

        for (int i = start; i < end; i++) {
            Ticket ticket = tickets.get(i);
            int slot = i - start;
            if (slot >= pageSize) break;

            Material mat = switch (ticket.getStatus()) {
                case "open" -> Material.PAPER;
                case "in_progress" -> Material.BOOK;
                case "resolved" -> Material.ENCHANTED_BOOK;
                default -> Material.BARRIER;
            };

            actions.put(slot, new SlotAction(
                createItem(mat, "§e#" + ticket.getId() + " " + ticket.getTitle(), "§7状态: " + ticket.getStatusName()),
                () -> new TicketDetailMenu(plugin, config, lang, api, ticket).open(player)));
        }

        int createSlot = (rows - 1) * 9 + 4;
        actions.put(createSlot, new SlotAction(
            createItem(Material.EMERALD, "§a创建新议题"),
            () -> new CreateTicketMenu(plugin, config, lang, api, player).open(player)));

        if (page > 0) {
            int prevSlot = (rows - 1) * 9;
            actions.put(prevSlot, new SlotAction(
                createItem(Material.ARROW, "§7上一页"),
                () -> { setPage(page - 1); refresh(player); }));
        }
        if (end < tickets.size()) {
            int nextSlot = (rows - 1) * 9 + 8;
            actions.put(nextSlot, new SlotAction(
                createItem(Material.ARROW, "§7下一页"),
                () -> { setPage(page + 1); refresh(player); }));
        }

        return actions;
    }
}
