package ink.neokoni.lightTickets.Utils;

import java.util.Arrays;

public enum AccountRole {
    PLAYER("player"),
    STAFF("staff"),
    ADMIN("admin");

    private final String key;

    AccountRole(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public boolean isStaff() {
        return this == STAFF || this == ADMIN;
    }

    public String label() {
        String label = LangUtils.getRawLang("account.role_" + key);
        if (label.isEmpty()) {
            return LangUtils.getRawLang("account.role_player");
        }
        return label;
    }

    public static AccountRole fromKey(String key) {
        return Arrays.stream(values())
                .filter(role -> role.key.equals(key))
                .findFirst()
                .orElse(PLAYER);
    }
}
