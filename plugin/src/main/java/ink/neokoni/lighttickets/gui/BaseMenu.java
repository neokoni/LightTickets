package ink.neokoni.lighttickets.gui;

import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.config.PluginConfig;
import ink.neokoni.lighttickets.lang.LangManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public abstract class BaseMenu {
    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacySection();

    protected final LightTickets plugin;
    protected final PluginConfig config;
    protected final LangManager lang;
    protected final String title;
    protected final int rows;
    protected int page = 0;
    protected final Map<Integer, SlotAction> slotActions = new HashMap<>();

    public BaseMenu(LightTickets plugin, PluginConfig config, LangManager lang, String title, int rows) {
        this.plugin = plugin;
        this.config = config;
        this.lang = lang;
        this.title = title;
        this.rows = Math.max(1, Math.min(6, rows));
    }

    protected abstract Map<Integer, SlotAction> render(Player player);

    public void open(Player player) {
        Inventory inv = Bukkit.createInventory(null, rows * 9, SERIALIZER.deserialize(title));
        slotActions.clear();
        Map<Integer, SlotAction> actions = render(player);
        slotActions.putAll(actions);

        for (Map.Entry<Integer, SlotAction> entry : actions.entrySet()) {
            if (entry.getKey() < inv.getSize()) {
                inv.setItem(entry.getKey(), entry.getValue().getItem());
            }
        }

        plugin.getMenuManager().register(this, player);
        player.openInventory(inv);
    }

    public void refresh(Player player) {
        Inventory inv = player.getOpenInventory().getTopInventory();
        if (inv == null || !player.getOpenInventory().getTitle().equals(SERIALIZER.deserialize(title))) return;

        slotActions.clear();
        Map<Integer, SlotAction> actions = render(player);
        slotActions.putAll(actions);

        for (int i = 0; i < inv.getSize(); i++) {
            inv.setItem(i, null);
        }
        for (Map.Entry<Integer, SlotAction> entry : actions.entrySet()) {
            if (entry.getKey() < inv.getSize()) {
                inv.setItem(entry.getKey(), entry.getValue().getItem());
            }
        }
    }

    public void close(Player player) {
        player.closeInventory();
        plugin.getMenuManager().unregister(player);
    }

    public SlotAction getAction(int slot) {
        return slotActions.get(slot);
    }

    public String getTitle() { return title; }

    public Inventory getInventory() {
        return Bukkit.createInventory(null, rows * 9, SERIALIZER.deserialize(title));
    }

    protected ItemStack placeholder() {
        Material mat = Material.getMaterial("GRAY_STAINED_GLASS_PANE");
        if (mat == null) mat = Material.getMaterial("STAINED_GLASS_PANE");
        if (mat == null) mat = Material.GLASS_PANE;
        ItemStack item = new ItemStack(mat);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.space());
        item.setItemMeta(meta);
        return item;
    }

    protected ItemStack createItem(Material material, String name, String... lore) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(SERIALIZER.deserialize(name));
            if (lore.length > 0) {
                meta.lore(java.util.Arrays.stream(lore)
                    .map(SERIALIZER::deserialize)
                    .toList());
            }
            item.setItemMeta(meta);
        }
        return item;
    }

    protected int getPageStart() { return page * getPageSize(); }
    protected int getPageSize() { return (rows - 2) * 9; }
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }
}
