package ink.neokoni.lightTickets.platform;

import org.jetbrains.annotations.Nullable;

import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

public interface LightPlatform {

    Logger getLogger();

    Path getDataPath();

    @Nullable
    LightPlayer getPlayer(UUID uuid);

    void runAsync(Runnable task);

    void scheduleAtFixedRate(Runnable task, long initialDelay, long period, TimeUnit unit);

    void runOnMainThread(Runnable task);

    CompletableFuture<Boolean> dispatchConsoleCommand(String command);

    void saveResource(String path);
}
