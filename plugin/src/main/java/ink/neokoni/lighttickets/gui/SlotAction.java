package ink.neokoni.lighttickets.gui;

import org.bukkit.inventory.ItemStack;

public class SlotAction {
    private final ItemStack item;
    private final Runnable onClick;

    public SlotAction(ItemStack item, Runnable onClick) {
        this.item = item;
        this.onClick = onClick;
    }

    public SlotAction(ItemStack item) {
        this(item, null);
    }

    public ItemStack getItem() { return item; }
    public Runnable getOnClick() { return onClick; }
    public boolean hasAction() { return onClick != null; }
}
