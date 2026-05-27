package ink.neokoni.lighttickets.gui;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.inventory.Inventory;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MenuManager implements Listener {
    private final Map<UUID, BaseMenu> openMenus = new ConcurrentHashMap<>();

    public void register(BaseMenu menu, Player player) {
        openMenus.put(player.getUniqueId(), menu);
    }

    public void unregister(Player player) {
        openMenus.remove(player.getUniqueId());
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        BaseMenu menu = openMenus.get(player.getUniqueId());
        if (menu == null) return;
        if (!event.getView().getTitle().equals(menu.getTitle())) {
            openMenus.remove(player.getUniqueId());
            return;
        }

        event.setCancelled(true);
        int slot = event.getRawSlot();
        if (slot < 0 || slot >= menu.getInventory().getSize()) return;

        SlotAction action = menu.getAction(slot);
        if (action != null && action.hasAction()) {
            action.getOnClick().run();
        }
    }

    @EventHandler
    public void onInventoryClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player player)) return;
        BaseMenu menu = openMenus.get(player.getUniqueId());
        if (menu != null && event.getView().getTitle().equals(menu.getTitle())) {
            openMenus.remove(player.getUniqueId());
        }
    }
}
