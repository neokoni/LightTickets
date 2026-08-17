package ink.neokoni.lightTickets.velocity.Commands;

import com.google.gson.JsonObject;
import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.velocitypowered.api.command.BrigadierCommand;
import com.velocitypowered.api.command.CommandSource;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
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
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.TicketSearchParser;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import ink.neokoni.lightTickets.platform.LightPlayer;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import ink.neokoni.lightTickets.velocity.LightTicketsVelocity;
import ink.neokoni.lightTickets.velocity.platform.VelocityPlayer;
import ink.neokoni.lightTickets.velocity.platform.VelocitySender;

import java.util.List;
import java.util.Map;

public final class VelocityCommandRegister {

    private final ProxyServer server;

    public VelocityCommandRegister(LightTicketsVelocity plugin) {
        this.server = plugin.getServer();
        LiteralArgumentBuilder<CommandSource> root = buildCommand("lit");
        server.getCommandManager().register(
                "lit", new BrigadierCommand(root.build()), "lighttickets");
    }

    private static LiteralArgumentBuilder<CommandSource> buildCommand(String name) {
        LiteralArgumentBuilder<CommandSource> root = BrigadierCommand.literalArgumentBuilder(name);

        root.then(BrigadierCommand.literalArgumentBuilder("bind")
                .requires(s -> s.hasPermission("lighttickets.bind")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new BindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(BrigadierCommand.literalArgumentBuilder("unbind")
                .requires(s -> s.hasPermission("lighttickets.unbind")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new UnbindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(BrigadierCommand.literalArgumentBuilder("account")
                .requires(s -> s.hasPermission("lighttickets.account")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new AccountInfo(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(BrigadierCommand.literalArgumentBuilder("register")
                .requires(s -> s.hasPermission("lighttickets.register")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new BindAccount(lightPlayer));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        LiteralArgumentBuilder<CommandSource> ticket =
                BrigadierCommand.literalArgumentBuilder("ticket");

        ticket.then(BrigadierCommand.literalArgumentBuilder("create")
                .requires(s -> s.hasPermission("lighttickets.ticket.create")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        new CreateTicket(new VelocityPlayer(player));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(BrigadierCommand.requiredArgumentBuilder("type", StringArgumentType.string())
                        .executes(ctx -> {
                            if (ctx.getSource() instanceof Player player) {
                                String type = StringArgumentType.getString(ctx, "type");
                                new CreateTicket(new VelocityPlayer(player), type);
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(BrigadierCommand.literalArgumentBuilder("list")
                .requires(s -> s.hasPermission("lighttickets.ticket.list")
                        || s.hasPermission("lighttickets.player"))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(() -> new TicketList(lightPlayer, 1));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(BrigadierCommand.requiredArgumentBuilder("page", IntegerArgumentType.integer(1))
                        .executes(ctx -> {
                            if (ctx.getSource() instanceof Player player) {
                                int page = IntegerArgumentType.getInteger(ctx, "page");
                                LightPlayer lightPlayer = new VelocityPlayer(player);
                                LightPlatformProvider.get().runAsync(
                                        () -> new TicketList(lightPlayer, page));
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        for (TicketStatus statusFilter : TicketStatus.selectableByStaff()) {
            ticket.then(BrigadierCommand.literalArgumentBuilder("list:" + statusFilter.key())
                    .requires(s -> s.hasPermission("lighttickets.ticket.list")
                            || s.hasPermission("lighttickets.player"))
                    .executes(ctx -> {
                        if (ctx.getSource() instanceof Player player) {
                            LightPlayer lightPlayer = new VelocityPlayer(player);
                            LightPlatformProvider.get().runAsync(
                                    () -> new TicketList(lightPlayer, 1, statusFilter));
                        }
                        return Command.SINGLE_SUCCESS;
                    })
                    .then(BrigadierCommand.requiredArgumentBuilder(
                            "page", IntegerArgumentType.integer(1))
                            .executes(ctx -> {
                                if (ctx.getSource() instanceof Player player) {
                                    int page = IntegerArgumentType.getInteger(ctx, "page");
                                    LightPlayer lightPlayer = new VelocityPlayer(player);
                                    LightPlatformProvider.get().runAsync(
                                            () -> new TicketList(lightPlayer, page, statusFilter));
                                }
                                return Command.SINGLE_SUCCESS;
                            })));
        }

        LiteralArgumentBuilder<CommandSource> search =
                BrigadierCommand.literalArgumentBuilder("search")
                        .requires(s -> s.hasPermission("lighttickets.ticket.list")
                                || s.hasPermission("lighttickets.player"))
                        .executes(ctx -> {
                            ctx.getSource().sendMessage(LangUtils.getLang("ticket.search_usage"));
                            return Command.SINGLE_SUCCESS;
                        });

        search.then(BrigadierCommand.requiredArgumentBuilder(
                "query", StringArgumentType.greedyString())
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        String query = StringArgumentType.getString(ctx, "query");
                        var searchFilter = TicketSearchParser.parse(query);
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(
                                () -> new TicketList(lightPlayer, 1, searchFilter));
                    }
                    return Command.SINGLE_SUCCESS;
                }));

        search.then(BrigadierCommand.literalArgumentBuilder("--page")
                .then(BrigadierCommand.requiredArgumentBuilder(
                        "searchPage", IntegerArgumentType.integer(1))
                        .then(BrigadierCommand.requiredArgumentBuilder(
                                "searchQuery", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    if (ctx.getSource() instanceof Player player) {
                                        int page = IntegerArgumentType.getInteger(
                                                ctx, "searchPage");
                                        String query = StringArgumentType.getString(
                                                ctx, "searchQuery");
                                        var searchFilter = TicketSearchParser.parse(query);
                                        LightPlayer lightPlayer = new VelocityPlayer(player);
                                        LightPlatformProvider.get().runAsync(
                                                () -> new TicketList(lightPlayer, page, searchFilter));
                                    }
                                    return Command.SINGLE_SUCCESS;
                                }))));

        ticket.then(search);

        LiteralArgumentBuilder<CommandSource> info =
                BrigadierCommand.literalArgumentBuilder("info")
                        .requires(s -> s.hasPermission("lighttickets.ticket.info")
                                || s.hasPermission("lighttickets.player"));

        info.then(BrigadierCommand.requiredArgumentBuilder("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        LightPlayer lightPlayer = new VelocityPlayer(player);
                        LightPlatformProvider.get().runAsync(
                                () -> new TicketInfo(lightPlayer, id));
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(BrigadierCommand.requiredArgumentBuilder(
                        "commentPage", IntegerArgumentType.integer(1))
                        .executes(ctx -> {
                            if (ctx.getSource() instanceof Player player) {
                                int id = IntegerArgumentType.getInteger(ctx, "id");
                                int cp = IntegerArgumentType.getInteger(ctx, "commentPage");
                                LightPlayer lightPlayer = new VelocityPlayer(player);
                                LightPlatformProvider.get().runAsync(
                                        () -> new TicketInfo(lightPlayer, id, cp));
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(info);

        LiteralArgumentBuilder<CommandSource> comment =
                BrigadierCommand.literalArgumentBuilder("comment")
                        .requires(s -> s.hasPermission("lighttickets.ticket.comment")
                                || s.hasPermission("lighttickets.player"));

        comment.then(BrigadierCommand.requiredArgumentBuilder("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        new AddComment(new VelocityPlayer(player), id);
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(BrigadierCommand.literalArgumentBuilder("reply")
                        .then(BrigadierCommand.requiredArgumentBuilder(
                                "commentIndex", IntegerArgumentType.integer(0))
                                .executes(ctx -> {
                                    if (ctx.getSource() instanceof Player player) {
                                        int id = IntegerArgumentType.getInteger(ctx, "id");
                                        int idx = IntegerArgumentType.getInteger(
                                                ctx, "commentIndex");
                                        handleReply(player, id, idx);
                                    }
                                    return Command.SINGLE_SUCCESS;
                                }))));

        ticket.then(comment);

        LiteralArgumentBuilder<CommandSource> status =
                BrigadierCommand.literalArgumentBuilder("status")
                        .requires(s -> s.hasPermission("lighttickets.ticket.status")
                                || s.hasPermission("lighttickets.player"));

        status.then(BrigadierCommand.requiredArgumentBuilder("id", IntegerArgumentType.integer(1))
                .executes(ctx -> {
                    if (ctx.getSource() instanceof Player player) {
                        int id = IntegerArgumentType.getInteger(ctx, "id");
                        new ChangeStatus(new VelocityPlayer(player), id);
                    }
                    return Command.SINGLE_SUCCESS;
                })
                .then(BrigadierCommand.requiredArgumentBuilder(
                        "newStatus", StringArgumentType.string())
                        .executes(ctx -> {
                            if (ctx.getSource() instanceof Player player) {
                                int id = IntegerArgumentType.getInteger(ctx, "id");
                                String ns = StringArgumentType.getString(ctx, "newStatus");
                                new ChangeStatus(new VelocityPlayer(player), id, ns);
                            }
                            return Command.SINGLE_SUCCESS;
                        })));

        ticket.then(status);

        root.then(ticket);

        root.then(BrigadierCommand.literalArgumentBuilder("reload")
                .requires(s -> s.hasPermission("lighttickets.reload")
                        || s.hasPermission("lighttickets.admin"))
                .executes(ctx -> {
                    new Reload(new VelocitySender(ctx.getSource()));
                    return Command.SINGLE_SUCCESS;
                }));

        root.then(BrigadierCommand.literalArgumentBuilder("status")
                .requires(s -> s.hasPermission("lighttickets.status")
                        || s.hasPermission("lighttickets.admin"))
                .executes(ctx -> {
                    new Status(new VelocitySender(ctx.getSource()));
                    return Command.SINGLE_SUCCESS;
                }));

        return root;
    }

    private static void handleReply(Player player, int ticketId, int commentIndex) {
        LightPlayer lightPlayer = new VelocityPlayer(player);
        List<JsonObject> comments = TicketInfo.getPlayerComments(
                player.getUniqueId(), ticketId);
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
        new AddComment(lightPlayer, ticketId, author, body);
    }
}
