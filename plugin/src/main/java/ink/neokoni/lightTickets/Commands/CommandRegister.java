package ink.neokoni.lightTickets.Commands;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import ink.neokoni.lightTickets.Commands.Functions.BindAccount;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.LightTickets;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

public class CommandRegister {
    public CommandRegister() {
        LightTickets plugin = LightTickets.getInstance();
        plugin.getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, command -> {
            String[] commands = {"lit", "lighttickets"};
            for (String c : commands) {
                LiteralArgumentBuilder<CommandSourceStack> targetCommand = new Register().get(c);
                command.registrar().register(targetCommand.build());
            }
        });
    }

    private static class Register {
        public LiteralArgumentBuilder<CommandSourceStack> get(String command) {
            return Commands.literal(command)
                    .then(Commands.literal("bind")
                            .executes(ctx -> {
                                if (ctx.getSource().getSender() instanceof Player player) {
                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                            task -> new BindAccount(player));
                                }
                                return Command.SINGLE_SUCCESS;
                            }))
                    .then(Commands.literal("ticket")
                            .then(Commands.literal("create")
                                    .then(Commands.argument("title", StringArgumentType.greedyString())
                                            .executes(ctx -> {
                                                if (ctx.getSource().getSender() instanceof Player player) {
                                                    String title = StringArgumentType.getString(ctx, "title");
                                                    String world = player.getWorld().getName();
                                                    int x = player.getLocation().getBlockX();
                                                    int y = player.getLocation().getBlockY();
                                                    int z = player.getLocation().getBlockZ();
                                                    String gameMode = player.getGameMode().name().toLowerCase();
                                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                            task -> new CreateTicket(player, title, world, x, y, z, gameMode));
                                                }
                                                return Command.SINGLE_SUCCESS;
                                            }))));
        }
    }
}