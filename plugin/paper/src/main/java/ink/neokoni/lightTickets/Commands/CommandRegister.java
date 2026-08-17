package ink.neokoni.lightTickets.Commands;

import com.google.gson.JsonObject;
import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import ink.neokoni.lightTickets.Commands.Functions.AccountInfo;
import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.BindAccount;
import ink.neokoni.lightTickets.Commands.Functions.ChangeStatus;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Commands.Functions.Reload;
import ink.neokoni.lightTickets.Commands.Functions.Status;
import ink.neokoni.lightTickets.Commands.Functions.TicketInfo;
import ink.neokoni.lightTickets.Commands.Functions.TicketList;
import ink.neokoni.lightTickets.Commands.Functions.UnbindAccount;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.TicketSearchParser;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import ink.neokoni.lightTickets.platform.LightPlayer;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import ink.neokoni.lightTickets.platform.PaperPlayer;
import ink.neokoni.lightTickets.platform.PaperSender;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Map;

public class CommandRegister {
    public CommandRegister() {
        LightTickets plugin = LightTickets.getInstance();
        plugin.getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, command -> {
            String[] cmds = {"lit", "lighttickets"};
            for (String c : cmds) {
                LiteralArgumentBuilder<CommandSourceStack> targetCommand = buildCommand(c);
                command.registrar().register(targetCommand.build());
            }
        });
    }

    private static LiteralArgumentBuilder<CommandSourceStack> buildCommand(String name) {
        var root = Commands.literal(name);

        root.then(Commands.literal("bind")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.bind")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new BindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(Commands.literal("unbind")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.unbind")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new UnbindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(Commands.literal("account")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.account")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new AccountInfo(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(Commands.literal("register")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.register")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new BindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        var ticket = Commands.literal("ticket");

        ticket.then(Commands.literal("create")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.create")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        new CreateTicket(new PaperPlayer(player));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(Commands.argument("type", StringArgumentType.string())
                        .executes(ctx -> {
                            if (ctx.getSource().getSender() instanceof Player player) {
                                String type = StringArgumentType.getString(ctx, "type");
                                new CreateTicket(new PaperPlayer(player), type);
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(Commands.literal("list")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.list")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, 1));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(Commands.argument("page", IntegerArgumentType.integer(1))
                        .executes(ctx -> {
                            if (ctx.getSource().getSender() instanceof Player player) {
                                int page = IntegerArgumentType.getInteger(ctx, "page");
                                LightPlayer lightPlayer = new PaperPlayer(player);
                                LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, page));
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        for (TicketStatus statusFilter : TicketStatus.selectableByStaff()) {
            ticket.then(Commands.literal("list:" + statusFilter.key())
                    .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.list")
                            || ctx.getSender().hasPermission("lighttickets.player"))
                    .executes(ctx -> {
                        if (ctx.getSource().getSender() instanceof Player player) {
                            LightPlayer lightPlayer = new PaperPlayer(player);
                            LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, 1, statusFilter));
                        }
                        return Command.SINGLE_SUCCESS;
                    })
                    .then(Commands.argument("page", IntegerArgumentType.integer(1))
                            .executes(ctx -> {
                                if (ctx.getSource().getSender() instanceof Player player) {
                                    int page = IntegerArgumentType.getInteger(ctx, "page");
                                    LightPlayer lightPlayer = new PaperPlayer(player);
                                    LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, page, statusFilter));
                                }
                                return Command.SINGLE_SUCCESS;
                            })));
        }

        var search = Commands.literal("search")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.list")
                        || ctx.getSender().hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    ctx.getSource().getSender().sendMessage(LangUtils.getLang("ticket.search_usage"));
                    return Command.SINGLE_SUCCESS;
                });

        search.then(Commands.argument("query", StringArgumentType.greedyString())
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        String query = StringArgumentType.getString(ctx, "query");
                        var searchFilter = TicketSearchParser.parse(query);
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, 1, searchFilter));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        search.then(Commands.literal("--page")
                .then(Commands.argument("searchPage", IntegerArgumentType.integer(1))
                        .then(Commands.argument("searchQuery", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    if (ctx.getSource().getSender() instanceof Player player) {
                                        int page = IntegerArgumentType.getInteger(ctx, "searchPage");
                                        String query = StringArgumentType.getString(ctx, "searchQuery");
                                        var searchFilter = TicketSearchParser.parse(query);
                                        LightPlayer lightPlayer = new PaperPlayer(player);
                                        LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, page, searchFilter));
                                    }
                                    return Command.SINGLE_SUCCESS;
                                }))));

        ticket.then(search);

        var info = Commands.literal("info")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.info")
                        || ctx.getSender().hasPermission("lighttickets.player"));

        info.then(Commands.argument("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        LightPlayer lightPlayer = new PaperPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new TicketInfo(lightPlayer, id));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(Commands.argument("commentPage", IntegerArgumentType.integer(1))
                        .executes(ctx -> {
                            if (ctx.getSource().getSender() instanceof Player player) {
                                int id = IntegerArgumentType.getInteger(ctx, "id");
                                int cp = IntegerArgumentType.getInteger(ctx, "commentPage");
                                LightPlayer lightPlayer = new PaperPlayer(player);
                                LightPlatformProvider.get().runAsync(() -> new TicketInfo(lightPlayer, id, cp));
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(info);

        var comment = Commands.literal("comment")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.comment")
                        || ctx.getSender().hasPermission("lighttickets.player"));

        comment.then(Commands.argument("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        new AddComment(new PaperPlayer(player), id);
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(Commands.literal("reply")
                        .then(Commands.argument("commentIndex", IntegerArgumentType.integer(0))
                                .executes(ctx -> {
                                    if (ctx.getSource().getSender() instanceof Player player) {
                                        int id = IntegerArgumentType.getInteger(ctx, "id");
                                        int idx = IntegerArgumentType.getInteger(ctx, "commentIndex");
                                        handleReply(new PaperPlayer(player), id, idx);
                                    }
                                    return Command.SINGLE_SUCCESS;
                                }))));

        ticket.then(comment);

        var status = Commands.literal("status")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.ticket.status")
                        || ctx.getSender().hasPermission("lighttickets.player"));

        status.then(Commands.argument("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource().getSender() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        new ChangeStatus(new PaperPlayer(player), id);
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(Commands.argument("newStatus", StringArgumentType.string())
                        .executes(ctx -> {
                            if (ctx.getSource().getSender() instanceof Player player) {
                                int id = IntegerArgumentType.getInteger(ctx, "id");
                                String ns = StringArgumentType.getString(ctx, "newStatus");
                                new ChangeStatus(new PaperPlayer(player), id, ns);
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(status);

        root.then(ticket);

        root.then(Commands.literal("reload")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.reload")
                        || ctx.getSender().hasPermission("lighttickets.admin"))
                .executes(ctx -> {
                    new Reload(new PaperSender(ctx.getSource().getSender()));
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(Commands.literal("status")
                .requires(ctx -> ctx.getSender().hasPermission("lighttickets.status")
                        || ctx.getSender().hasPermission("lighttickets.admin"))
                .executes(ctx -> {
                    new Status(new PaperSender(ctx.getSource().getSender()));
                    return Command.SINGLE_SUCCESS;
                }));

        return root;
    }

    private static void handleReply(LightPlayer player, int ticketId, int commentIndex) {
        List<JsonObject> comments = TicketInfo.getPlayerComments(player.getUniqueId(), ticketId);
        if (comments == null || commentIndex < 0 || commentIndex >= comments.size()) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LangUtils.getRawLang("errors.invalid_response"))));
            return;
        }
        JsonObject comment = comments.get(commentIndex);
        String author = "";
        if (comment.has("author") && comment.get("author").isJsonObject()) {
            JsonObject authorObj = comment.getAsJsonObject("author");
            author = authorObj.has("username") ? authorObj.get("username").getAsString() : "";
        }
        String body = comment.has("body") ? comment.get("body").getAsString() : "";
        new AddComment(player, ticketId, author, body);
    }
}
