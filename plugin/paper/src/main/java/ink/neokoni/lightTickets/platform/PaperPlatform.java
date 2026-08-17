package ink.neokoni.lightTickets.platform;

import ink.neokoni.lightTickets.LightTickets;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.Nullable;

import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

public final class PaperPlatform implements LightPlatform {

    private final LightTickets plugin;

    public PaperPlatform(LightTickets plugin) {
        this.plugin = plugin;
    }

    @Override
    public Logger getLogger() {
        return plugin.getLogger();
    }

    @Override
    public Path getDataPath() {
        return plugin.getDataPath();
    }

    @Override
    public @Nullable LightPlayer getPlayer(UUID uuid) {
        Player p = Bukkit.getPlayer(uuid);
        return p == null ? null : new PaperPlayer(p);
    }

    @Override
    public void runAsync(Runnable task) {
        Bukkit.getAsyncScheduler().runNow(plugin, t -> task.run());
    }

    @Override
    public void scheduleAtFixedRate(Runnable task, long initialDelay, long period, TimeUnit unit) {
        Bukkit.getAsyncScheduler().runAtFixedRate(plugin, t -> task.run(), initialDelay, period, unit);
    }

    @Override
    public void runOnMainThread(Runnable task) {
        Bukkit.getGlobalRegionScheduler().run(plugin, t -> task.run());
    }

    @Override
    public CompletableFuture<Boolean> dispatchConsoleCommand(String command) {
        CompletableFuture<Boolean> future = new CompletableFuture<>();
        Bukkit.getGlobalRegionScheduler().run(plugin, t -> {
            try {
                future.complete(Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command));
            } catch (Throwable e) {
                future.completeExceptionally(e);
            }
        });
        return future;
    }

    @Override
    public void saveResource(String path) {
        plugin.saveResource(path, false);
    }
}
