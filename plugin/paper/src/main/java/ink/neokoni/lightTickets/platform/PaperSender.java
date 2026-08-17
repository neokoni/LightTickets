package ink.neokoni.lightTickets.platform;

import net.kyori.adventure.text.Component;
import org.bukkit.command.CommandSender;

public final class PaperSender implements LightSender {

    private final CommandSender sender;

    public PaperSender(CommandSender sender) {
        this.sender = sender;
    }

    @Override
    public void sendMessage(Component message) {
        sender.sendMessage(message);
    }
}
