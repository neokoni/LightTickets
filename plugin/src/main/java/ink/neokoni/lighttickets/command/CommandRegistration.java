package ink.neokoni.lighttickets.command;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.tree.LiteralCommandNode;
import ink.neokoni.lighttickets.LightTickets;
import ink.neokoni.lighttickets.gui.MainMenu;
import ink.neokoni.lighttickets.handler.LinkHandler;
import ink.neokoni.lighttickets.lang.LangManager;
import ink.neokoni.lighttickets.model.Ticket;
import ink.neokoni.lighttickets.network.ApiClient;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import net.kyori.adventure.text.Component;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.List;

public class CommandRegistration {
    private final LightTickets plugin;
    private final ApiClient api;
    private final LangManager lang;
    private final LinkHandler linkHandler;

    public CommandRegistration(LightTickets plugin, ApiClient api, LangManager lang, LinkHandler linkHandler) {
        this.plugin = plugin;
        this.api = api;
        this.lang = lang;
        this.linkHandler = linkHandler;
    }

    public void register() {
        plugin.getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event -> {
            var commands = event.registrar();

            var root = Commands.literal("lt");

            root.executes(this::openMainMenu);

            root.then(Commands.literal("help").executes(this::help));
            root.then(Commands.literal("link").executes(this::link));
            root.then(Commands.literal("tickets").executes(this::tickets));

            root.then(Commands.literal("ticket")
                .then(Commands.argument("id", StringArgumentType.word())
                    .executes(this::ticketDetail)));

            root.then(Commands.literal("create")
                .then(Commands.argument("title", StringArgumentType.greedyString())
                    .executes(this::createTicket)));

            root.then(Commands.literal("comment")
                .then(Commands.argument("id", StringArgumentType.word())
                    .then(Commands.argument("text", StringArgumentType.greedyString())
                        .executes(this::comment))));

            commands.register(root.build(), "LightTickets main command", List.of("lighttickets"));
        });
    }

    private boolean requirePlayer(CommandContext<CommandSourceStack> ctx) {
        CommandSender sender = ctx.getSource().getSender();
        if (!(sender instanceof Player)) {
            sender.sendMessage(Component.text("This command can only be used by players."));
            return false;
        }
        return true;
    }

    private boolean hasPermission(CommandSender sender, String node) {
        return sender.hasPermission("lighttickets." + node) || sender.hasPermission("lighttickets.use");
    }

    private int openMainMenu(CommandContext<CommandSourceStack> ctx) {
        CommandSender sender = ctx.getSource().getSender();
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("This command can only be used by players."));
            return 0;
        }
        if (!hasPermission(player, "menu")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
            new MainMenu(plugin, plugin.getPluginConfig(), lang, api).open(player));
        return 1;
    }

    private int help(CommandContext<CommandSourceStack> ctx) {
        CommandSender sender = ctx.getSource().getSender();
        for (Component line : lang.helpLines()) {
            sender.sendMessage(line);
        }
        return 1;
    }

    private int link(CommandContext<CommandSourceStack> ctx) {
        if (!requirePlayer(ctx)) return 0;
        Player player = (Player) ctx.getSource().getSender();
        if (!hasPermission(player, "link")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        linkHandler.startLink(player);
        return 1;
    }

    private int tickets(CommandContext<CommandSourceStack> ctx) {
        if (!requirePlayer(ctx)) return 0;
        Player player = (Player) ctx.getSource().getSender();
        if (!hasPermission(player, "list")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        String uuid = player.getUniqueId().toString();
        api.getMyTickets(uuid)
            .thenAccept(tickets -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t -> {
                    if (tickets.isEmpty()) {
                        player.sendMessage(lang.prefix("cmd-tickets-empty"));
                        return;
                    }
                    player.sendMessage(lang.prefix("cmd-tickets-header"));
                    for (Ticket ticket : tickets) {
                        player.sendMessage(lang.format("cmd-tickets-item",
                            "{id}", String.valueOf(ticket.getId()),
                            "{title}", ticket.getTitle(),
                            "{status}", ticket.getStatusName()));
                    }
                });
            })
            .exceptionally(ex -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix("error-api-failed")));
                return null;
            });
        return 1;
    }

    private int ticketDetail(CommandContext<CommandSourceStack> ctx) {
        if (!requirePlayer(ctx)) return 0;
        Player player = (Player) ctx.getSource().getSender();
        if (!hasPermission(player, "list")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        String uuid = player.getUniqueId().toString();
        int ticketId = Integer.parseInt(ctx.getArgument("id", String.class));

        api.getMyTickets(uuid)
            .thenAccept(tickets -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t -> {
                    Ticket found = tickets.stream()
                        .filter(tk -> tk.getId() == ticketId)
                        .findFirst().orElse(null);
                    if (found == null) {
                        player.sendMessage(lang.prefixFormat("error-ticket-not-found", "{ticketId}", String.valueOf(ticketId)));
                        return;
                    }
                    player.sendMessage(lang.prefixFormat("cmd-ticket-header", "{id}", String.valueOf(found.getId())));
                    player.sendMessage(lang.format("cmd-ticket-title", "{title}", found.getTitle()));
                    player.sendMessage(lang.format("cmd-ticket-status", "{status}", found.getStatusName()));
                    player.sendMessage(lang.format("cmd-ticket-type", "{type}", found.getTypeName()));
                    player.sendMessage(lang.get("cmd-ticket-body"));
                    for (String line : found.getBody().split("\n")) {
                        player.sendMessage(Component.text("  " + line));
                    }
                });
            })
            .exceptionally(ex -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix("error-api-failed")));
                return null;
            });
        return 1;
    }

    private int createTicket(CommandContext<CommandSourceStack> ctx) {
        if (!requirePlayer(ctx)) return 0;
        Player player = (Player) ctx.getSource().getSender();
        if (!hasPermission(player, "create")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        String title = ctx.getArgument("title", String.class);
        String uuid = player.getUniqueId().toString();

        api.createTicket(uuid, title, "Created via /lt create", "bug_report")
            .thenAccept(ticket -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefixFormat("cmd-create-success",
                        "{ticketId}", String.valueOf(ticket.getId()), "{title}", ticket.getTitle())));
            })
            .exceptionally(ex -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix("error-api-failed")));
                return null;
            });
        return 1;
    }

    private int comment(CommandContext<CommandSourceStack> ctx) {
        if (!requirePlayer(ctx)) return 0;
        Player player = (Player) ctx.getSource().getSender();
        if (!hasPermission(player, "comment")) {
            player.sendMessage(lang.get("no-permission"));
            return 0;
        }
        int ticketId = Integer.parseInt(ctx.getArgument("id", String.class));
        String text = ctx.getArgument("text", String.class);
        String uuid = player.getUniqueId().toString();

        api.addComment(uuid, ticketId, text)
            .thenRun(() -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix("cmd-comment-success")));
            })
            .exceptionally(ex -> {
                plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix("error-api-failed")));
                return null;
            });
        return 1;
    }
}
