package ink.neokoni.lightTickets.velocity.packet;

import com.github.retrooper.packetevents.event.PacketListener;
import com.github.retrooper.packetevents.event.PacketSendEvent;
import com.github.retrooper.packetevents.event.UserDisconnectEvent;
import com.github.retrooper.packetevents.protocol.packettype.PacketType;
import com.github.retrooper.packetevents.protocol.player.GameMode;
import com.github.retrooper.packetevents.protocol.teleport.RelativeFlag;
import com.github.retrooper.packetevents.resources.ResourceLocation;
import com.github.retrooper.packetevents.util.Vector3i;
import com.github.retrooper.packetevents.wrapper.play.server.WrapperPlayServerJoinGame;
import com.github.retrooper.packetevents.wrapper.play.server.WrapperPlayServerPlayerPositionAndLook;
import com.github.retrooper.packetevents.wrapper.play.server.WrapperPlayServerRespawn;
import com.github.retrooper.packetevents.wrapper.play.server.WrapperPlayServerSpawnPosition;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PlayerContextListener implements PacketListener {

    public record PlayerContext(String world, double x, double y, double z, String gameMode) {
        public static final PlayerContext DEFAULT = new PlayerContext("", 0D, 0D, 0D, "survival");
    }

    private static final ConcurrentHashMap<UUID, PlayerContext> CONTEXTS = new ConcurrentHashMap<>();

    @Override
    public void onPacketSend(PacketSendEvent event) {
        UUID uuid = event.getUser().getUUID();
        if (uuid == null) {
            return;
        }
        PlayerContext ctx = CONTEXTS.get(uuid);
        if (ctx == null) {
            ctx = PlayerContext.DEFAULT;
        }

        if (event.getPacketType() == PacketType.Play.Server.JOIN_GAME) {
            WrapperPlayServerJoinGame wrapper = new WrapperPlayServerJoinGame(event);
            String world = wrapper.getWorldName();
            if (world == null || world.isEmpty()) {
                ResourceLocation dimension = wrapper.getDimensionTypeRef() == null
                        ? null : wrapper.getDimensionTypeRef().getName();
                world = dimension == null ? ctx.world() : dimension.toString();
            }
            GameMode gameMode = wrapper.getGameMode();
            CONTEXTS.put(uuid, new PlayerContext(world, ctx.x(), ctx.y(), ctx.z(),
                    gameMode == null ? ctx.gameMode() : gameMode.name().toLowerCase()));
        } else if (event.getPacketType() == PacketType.Play.Server.RESPAWN) {
            WrapperPlayServerRespawn wrapper = new WrapperPlayServerRespawn(event);
            String world = wrapper.getWorldName().orElse(ctx.world());
            GameMode gameMode = wrapper.getGameMode();
            CONTEXTS.put(uuid, new PlayerContext(world, ctx.x(), ctx.y(), ctx.z(),
                    gameMode == null ? ctx.gameMode() : gameMode.name().toLowerCase()));
        } else if (event.getPacketType() == PacketType.Play.Server.PLAYER_POSITION_AND_LOOK) {
            WrapperPlayServerPlayerPositionAndLook wrapper =
                    new WrapperPlayServerPlayerPositionAndLook(event);
            double dx = wrapper.getX();
            double dy = wrapper.getY();
            double dz = wrapper.getZ();
            double x = wrapper.isRelativeFlag(RelativeFlag.X) ? ctx.x() + dx : dx;
            double y = wrapper.isRelativeFlag(RelativeFlag.Y) ? ctx.y() + dy : dy;
            double z = wrapper.isRelativeFlag(RelativeFlag.Z) ? ctx.z() + dz : dz;
            CONTEXTS.put(uuid, new PlayerContext(ctx.world(), x, y, z, ctx.gameMode()));
        } else if (event.getPacketType() == PacketType.Play.Server.SPAWN_POSITION) {
            WrapperPlayServerSpawnPosition wrapper = new WrapperPlayServerSpawnPosition(event);
            Vector3i position = wrapper.getPosition();
            if (position != null) {
                CONTEXTS.put(uuid, new PlayerContext(ctx.world(),
                        position.getX(), position.getY(), position.getZ(), ctx.gameMode()));
            }
        }
    }

    @Override
    public void onUserDisconnect(UserDisconnectEvent event) {
        UUID uuid = event.getUser().getUUID();
        if (uuid != null) {
            CONTEXTS.remove(uuid);
        }
    }

    /** 查询玩家上下文; 未知玩家返回默认 {@link PlayerContext#DEFAULT}。 */
    public static PlayerContext get(UUID uuid) {
        PlayerContext ctx = CONTEXTS.get(uuid);
        return ctx == null ? PlayerContext.DEFAULT : ctx;
    }

    /** 移除玩家缓存 (玩家断开时调用)。 */
    public static void remove(UUID uuid) {
        CONTEXTS.remove(uuid);
    }
}
