package ink.neokoni.lightTickets.Commands;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import ink.neokoni.lightTickets.Commands.Functions.AccountInfo;
import ink.neokoni.lightTickets.Commands.Functions.BindAccount;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Commands.Functions.RegisterAccount;
import ink.neokoni.lightTickets.Commands.Functions.Reload;
import ink.neokoni.lightTickets.Commands.Functions.TicketInfo;
import ink.neokoni.lightTickets.Commands.Functions.TicketList;
import ink.neokoni.lightTickets.Commands.Functions.UnbindAccount;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.LangUtils;
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
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.bind")
                                    || ctx.getSender().hasPermission("lighttickets.player"))
                            .executes(ctx -> {
                                if (ctx.getSource().getSender() instanceof Player player) {
                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                            task -> new BindAccount(player));
                                }
                                return Command.SINGLE_SUCCESS;
                            }))
                    .then(Commands.literal("unbind")
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.unbind")
                                    || ctx.getSender().hasPermission("lighttickets.player"))
                            .executes(ctx -> {
                                if (ctx.getSource().getSender() instanceof Player player) {
                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                            task -> new UnbindAccount(player));
                                }
                                return Command.SINGLE_SUCCESS;
                            }))
                    .then(Commands.literal("account")
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.account")
                                    || ctx.getSender().hasPermission("lighttickets.player"))
                            .executes(ctx -> {
                                if (ctx.getSource().getSender() instanceof Player player) {
                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                            task -> new AccountInfo(player));
                                }
                                return Command.SINGLE_SUCCESS;
                            }))
                    .then(Commands.literal("register")
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.register")
                                    || ctx.getSender().hasPermission("lighttickets.player"))
                            .executes(ctx -> {
                                ctx.getSource().getSender().sendMessage(LangUtils.getLang("register.usage"));
                                return Command.SINGLE_SUCCESS;
                            })
                            .then(Commands.argument("username", StringArgumentType.string())
                                    .then(Commands.argument("email", StringArgumentType.string())
                                            .then(Commands.argument("password", StringArgumentType.string())
                                                    .executes(ctx -> {
                                                        if (ctx.getSource().getSender() instanceof Player player) {
                                                            String name = StringArgumentType.getString(ctx, "username");
                                                            String mail = StringArgumentType.getString(ctx, "email");
                                                            String pass = StringArgumentType.getString(ctx, "password");
                                                            Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                                    task -> new RegisterAccount(player, name, mail, pass));
                                                        }
                                                        return Command.SINGLE_SUCCESS;
                                                    })))))
                    .then(Commands.literal("ticket")
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.create")
                                    || ctx.getSender().hasPermission("lighttickets.player"))
                            .then(Commands.literal("create")
                                    .executes(ctx -> {
                                        if (ctx.getSource().getSender() instanceof Player player) {
                                            new CreateTicket(player);
                                        }
                                        return Command.SINGLE_SUCCESS;
                                    })
                                    .then(Commands.argument("type", StringArgumentType.string())
                                            .executes(ctx -> {
                                                if (ctx.getSource().getSender() instanceof Player player) {
                                                    String type = StringArgumentType.getString(ctx, "type");
                                                    new CreateTicket(player, type);
                                                }
                                                return Command.SINGLE_SUCCESS;
                                            })))
                            .then(Commands.literal("list")
                                    .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.list")
                                            || ctx.getSender().hasPermission("lighttickets.player"))
                                    .executes(ctx -> {
                                        if (ctx.getSource().getSender() instanceof Player player) {
                                            Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                    task -> new TicketList(player, 1));
                                        }
                                        return Command.SINGLE_SUCCESS;
                                    })
                                    .then(Commands.argument("page", IntegerArgumentType.integer(1))
                                            .executes(ctx -> {
                                                if (ctx.getSource().getSender() instanceof Player player) {
                                                    int page = IntegerArgumentType.getInteger(ctx, "page");
                                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                            task -> new TicketList(player, page));
                                                }
                                                return Command.SINGLE_SUCCESS;
                                            })))
                            .then(Commands.literal("info")
                                    .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.info")
                                            || ctx.getSender().hasPermission("lighttickets.player"))
                                    .then(Commands.argument("id", IntegerArgumentType.integer(1))
                                            .executes(ctx -> {
                                                if (ctx.getSource().getSender() instanceof Player player) {
                                                    int id = IntegerArgumentType.getInteger(ctx, "id");
                                                    Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                            task -> new TicketInfo(player, id));
                                                }
                                                return Command.SINGLE_SUCCESS;
                                            })
                                            .then(Commands.argument("commentPage", IntegerArgumentType.integer(1))
                                                    .executes(ctx -> {
                                                        if (ctx.getSource().getSender() instanceof Player player) {
                                                            int id = IntegerArgumentType.getInteger(ctx, "id");
                                                            int commentPage = IntegerArgumentType.getInteger(ctx, "commentPage");
                                                            Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                                                                    task -> new TicketInfo(player, id, commentPage));
                                                        }
                                                        return Command.SINGLE_SUCCESS;
                                                    })))))
                    .then(Commands.literal("reload")
                            .requires(ctx -> ctx.getSender().hasPermission("lighttickets.reload")
                                    || ctx.getSender().hasPermission("lighttickets.admin"))
                            .executes(ctx -> {
                                new Reload(ctx.getSource().getSender());
                                return Command.SINGLE_SUCCESS;
                            }));
        }
    }
}