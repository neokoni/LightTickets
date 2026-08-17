package ink.neokoni.lightTickets.Listeners;

import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Commands.TicketInputProcessor;
import ink.neokoni.lightTickets.platform.PaperPlayer;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

public class TicketChatListener implements Listener {

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        String input = PlainTextComponentSerializer.plainText().serialize(event.message()).trim();
        if (TicketInputProcessor.process(new PaperPlayer(player), input)) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        CreateTicket.removeSession(new PaperPlayer(event.getPlayer()));
        AddComment.removeSession(new PaperPlayer(event.getPlayer()));
    }
}
