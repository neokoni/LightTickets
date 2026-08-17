package ink.neokoni.lightTickets.velocity.platform;

import com.velocitypowered.api.command.CommandSource;
import ink.neokoni.lightTickets.platform.LightSender;
import net.kyori.adventure.text.Component;

/**
 * Velocity 平台的 {@link LightSender} 实现, 包装任意命令源
 * (玩家或控制台), 供 /lit status、/lit reload 等控制台命令使用。
 */
public final class VelocitySender implements LightSender {

    private final CommandSource source;

    public VelocitySender(CommandSource source) {
        this.source = source;
    }

    @Override
    public void sendMessage(Component message) {
        source.sendMessage(message);
    }
}
