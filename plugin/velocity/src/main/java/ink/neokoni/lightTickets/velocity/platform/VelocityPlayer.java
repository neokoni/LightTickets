package ink.neokoni.lightTickets.velocity.platform;

import com.velocitypowered.api.proxy.Player;
import ink.neokoni.lightTickets.platform.LightPlayer;
import ink.neokoni.lightTickets.velocity.packet.PlayerContextListener;
import ink.neokoni.lightTickets.velocity.packet.PlayerContextListener.PlayerContext;
import net.kyori.adventure.text.Component;

import java.util.UUID;

/**
 * Velocity 平台的 {@link LightPlayer} 实现。
 *
 * <p>Velocity 原版 API 不暴露世界 / 坐标 / 游戏模式, 这些信息由
 * {@link PlayerContextListener} 通过拦截数据包 (JoinGame / Respawn /
 * PlayerPositionAndLook / SpawnPosition) 缓存提供; 缺失时回退到
 * 服务器名 / 默认值。</p>
 */
public final class VelocityPlayer implements LightPlayer {

    private final Player player;

    public VelocityPlayer(Player player) {
        this.player = player;
    }

    @Override
    public UUID getUniqueId() {
        return player.getUniqueId();
    }

    @Override
    public String getName() {
        return player.getUsername();
    }

    @Override
    public String getWorldName() {
        PlayerContext ctx = PlayerContextListener.get(player.getUniqueId());
        if (!ctx.world().isEmpty()) {
            return ctx.world();
        }
        return player.getCurrentServer()
                .map(connection -> connection.getServerInfo().getName())
                .orElse("");
    }

    @Override
    public int getBlockX() {
        return (int) Math.floor(PlayerContextListener.get(player.getUniqueId()).x());
    }

    @Override
    public int getBlockY() {
        return (int) Math.floor(PlayerContextListener.get(player.getUniqueId()).y());
    }

    @Override
    public int getBlockZ() {
        return (int) Math.floor(PlayerContextListener.get(player.getUniqueId()).z());
    }

    @Override
    public String getGameMode() {
        String gameMode = PlayerContextListener.get(player.getUniqueId()).gameMode();
        return gameMode.isEmpty() ? "survival" : gameMode;
    }

    @Override
    public void sendMessage(Component message) {
        player.sendMessage(message);
    }
}
