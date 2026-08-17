package ink.neokoni.lightTickets.velocity.packet;

import com.github.retrooper.packetevents.event.PacketListener;
import com.github.retrooper.packetevents.event.PacketReceiveEvent;
import com.github.retrooper.packetevents.protocol.packettype.PacketType;
import com.github.retrooper.packetevents.wrapper.play.client.WrapperPlayClientChatMessage;
import com.velocitypowered.api.proxy.Player;
import ink.neokoni.lightTickets.Commands.TicketInputProcessor;
import ink.neokoni.lightTickets.velocity.platform.VelocityPlayer;

public final class ChatInputListener implements PacketListener {

    @Override
    public void onPacketReceive(PacketReceiveEvent event) {
        if (event.getPacketType() != PacketType.Play.Client.CHAT_MESSAGE) {
            return;
        }
        Player player = event.getPlayer();
        if (player == null) {
            return;
        }
        String message = new WrapperPlayClientChatMessage(event).getMessage();
        if (message == null) {
            return;
        }
        boolean consumed = TicketInputProcessor.process(new VelocityPlayer(player), message.trim());
        if (consumed) {
            event.setCancelled(true);
        }
    }
}
