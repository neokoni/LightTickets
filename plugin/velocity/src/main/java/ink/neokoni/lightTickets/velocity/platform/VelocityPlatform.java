package ink.neokoni.lightTickets.velocity.platform;

import com.velocitypowered.api.proxy.ProxyServer;
import ink.neokoni.lightTickets.platform.LightPlatform;
import ink.neokoni.lightTickets.platform.LightPlayer;
import ink.neokoni.lightTickets.velocity.LightTicketsVelocity;
import org.jetbrains.annotations.Nullable;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * Velocity 平台的 {@link LightPlatform} 实现。
 *
 * <p>Velocity 注入的是 slf4j {@link org.slf4j.Logger}, 而 SPI 要求
 * {@code java.util.logging.Logger}。这里返回 JUL 的 "LightTickets" logger
 * (common 的 LogUtils 只使用 info/warning/severe), slf4j logger 保留在
 * 主类内供插件自身使用。</p>
 */
public final class VelocityPlatform implements LightPlatform {

    private final LightTicketsVelocity plugin;
    private final ProxyServer server;
    private final Logger logger = Logger.getLogger("LightTickets");

    public VelocityPlatform(LightTicketsVelocity plugin) {
        this.plugin = plugin;
        this.server = plugin.getServer();
    }

    @Override
    public Logger getLogger() {
        return logger;
    }

    @Override
    public Path getDataPath() {
        return plugin.getDataDirectory();
    }

    @Override
    @Nullable
    public LightPlayer getPlayer(UUID uuid) {
        return server.getPlayer(uuid).map(VelocityPlayer::new).orElse(null);
    }

    @Override
    public void runAsync(Runnable task) {
        server.getScheduler().buildTask(plugin, task).schedule();
    }

    @Override
    public void scheduleAtFixedRate(Runnable task, long initialDelay, long period, TimeUnit unit) {
        server.getScheduler().buildTask(plugin, task)
                .delay(initialDelay, unit)
                .repeat(period, unit)
                .schedule();
    }

    @Override
    public void runOnMainThread(Runnable task) {
        // Velocity 代理无 "主线程" 概念: scheduler 线程足够, 命令处理线程安全。
        server.getScheduler().buildTask(plugin, task).schedule();
    }

    @Override
    public CompletableFuture<Boolean> dispatchConsoleCommand(String command) {
        return server.getCommandManager().executeAsync(server.getConsoleCommandSource(), command);
    }

    @Override
    public void saveResource(String path) {
        Path target = plugin.getDataDirectory().resolve(path);
        if (Files.exists(target)) {
            return;
        }
        try {
            Files.createDirectories(target.getParent());
            try (InputStream in = plugin.getClass().getResourceAsStream("/" + path)) {
                if (in == null) {
                    return;
                }
                try (OutputStream out = Files.newOutputStream(target)) {
                    in.transferTo(out);
                }
            }
        } catch (IOException e) {
            logger.warning("Failed to save resource " + path + ": " + e.getMessage());
        }
    }
}
