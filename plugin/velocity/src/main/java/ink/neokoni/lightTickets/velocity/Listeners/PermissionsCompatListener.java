package ink.neokoni.lightTickets.velocity.Listeners;

import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.permission.PermissionsSetupEvent;
import com.velocitypowered.api.permission.PermissionFunction;
import com.velocitypowered.api.permission.PermissionProvider;
import com.velocitypowered.api.permission.Tristate;
import com.velocitypowered.api.proxy.Player;

import java.util.Map;

public final class PermissionsCompatListener {

    private static final Map<String, Boolean> DEFAULT_TRUE = Map.of(
            "lighttickets.bind", true,
            "lighttickets.unbind", true,
            "lighttickets.register", true,
            "lighttickets.account", true,
            "lighttickets.ticket.create", true,
            "lighttickets.ticket.list", true,
            "lighttickets.ticket.info", true,
            "lighttickets.ticket.comment", true,
            "lighttickets.ticket.status", true);

    @Subscribe(priority = Short.MIN_VALUE)
    public void onPermissionsSetup(PermissionsSetupEvent event) {
        if (!(event.getSubject() instanceof Player)) {
            return;
        }
        PermissionProvider original = event.getProvider();
        event.setProvider(subject -> {
            PermissionFunction base = original.createFunction(subject);
            return permission -> {
                Tristate value = base.getPermissionValue(permission);
                if (value != Tristate.UNDEFINED) {
                    return value;
                }
                if (DEFAULT_TRUE.containsKey(permission)) {
                    return Tristate.TRUE;
                }
                if (permission.equals("lighttickets.player")) {
                    return Tristate.TRUE;
                }
                return Tristate.FALSE;
            };
        });
    }
}
